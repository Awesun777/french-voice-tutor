/**
 * Google Drive / Docs helpers
 *
 * - refreshGoogleAccessToken   : use refresh token to get a new access token
 * - getValidAccessToken        : returns a valid access token (refreshes if needed)
 * - fetchGoogleDocText         : export a Google Doc as plain text
 * - extractVocabFromText       : use LLM to extract French words/phrases from doc text
 * - exportLibraryToGoogleDoc   : create or update a Google Doc with the user's vocab library
 */
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DOCS_EXPORT_URL = (docId: string) =>
  `https://docs.googleapis.com/v1/documents/${docId}`;
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

// ── Token management ──────────────────────────────────────────────────────────

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Google token: ${err}`);
  }

  return res.json();
}

/**
 * Returns a valid access token for the given userId, refreshing if expired.
 * Throws if the user has no connected Google account.
 */
export async function getValidAccessToken(userId: number): Promise<string> {
  const account = await db.getGoogleAccountByUserId(userId);
  if (!account) throw new Error("No Google account connected");

  // Give a 60-second buffer before expiry
  if (account.expiresAt > Date.now() + 60_000) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new Error("No refresh token available — user must reconnect Google");
  }

  const tokens = await refreshGoogleAccessToken(account.refreshToken);
  const newExpiresAt = Date.now() + tokens.expires_in * 1000;
  await db.updateGoogleTokens(userId, tokens.access_token, newExpiresAt);
  return tokens.access_token;
}

// ── Google Doc reading ────────────────────────────────────────────────────────

/**
 * Extract the Google Doc ID from a URL like:
 *   https://docs.google.com/document/d/DOC_ID/edit
 */
export function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch a Google Doc and return its plain-text content.
 */
export async function fetchGoogleDocText(docId: string, accessToken: string): Promise<string> {
  // Use the Docs API to get the document structure
  const res = await fetch(`${DOCS_EXPORT_URL(docId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Google Doc: ${err}`);
  }

  const doc = await res.json() as {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: { content?: string };
          }>;
        };
      }>;
    };
  };

  // Extract all text from the document
  const lines: string[] = [];
  for (const block of doc.body?.content ?? []) {
    if (!block.paragraph) continue;
    const text = (block.paragraph.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("");
    if (text.trim()) lines.push(text.trim());
  }

  return lines.join("\n");
}

// ── AI extraction ─────────────────────────────────────────────────────────────

export interface ExtractedWord {
  term: string;
  translation: string;
  kind: "word" | "phrase";
}

/**
 * Use the LLM to extract French vocabulary from raw document text.
 * Returns only items not already in the user's library (deduplication by term).
 */
export async function extractVocabFromText(
  text: string,
  existingTerms: Set<string>
): Promise<ExtractedWord[]> {
  if (!text.trim()) return [];

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a French vocabulary extractor. Given text that may contain French words, phrases, or vocabulary notes, extract all French vocabulary items.
Return a JSON array of objects with:
- term: the French word or phrase (with proper accents)
- translation: the English translation
- kind: "word" for single words/short expressions, "phrase" for full sentences or longer expressions

Only extract items that are clearly French vocabulary (not random French text). Focus on vocabulary that a learner would want to save.
If the text contains explicit vocabulary lists (e.g. "bonjour - hello"), extract those directly.
If the text is a conversation or story in French, extract notable vocabulary words.
Return an empty array if no clear vocabulary is found.`,
      },
      {
        role: "user",
        content: `Extract French vocabulary from this text:\n\n${text.slice(0, 8000)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "vocab_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  translation: { type: "string" },
                  kind: { type: "string", enum: ["word", "phrase"] },
                },
                required: ["term", "translation", "kind"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
  });

  let items: ExtractedWord[] = [];
  try {
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    items = parsed.items ?? [];
  } catch {
    return [];
  }

  // Deduplicate against existing library (case-insensitive, accent-insensitive)
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  return items.filter(
    (item) => item.term && !existingTerms.has(normalize(item.term))
  );
}

// ── Google Doc export ─────────────────────────────────────────────────────────

interface VocabRow {
  term: string;
  translation: string;
  entryKind: string;
  dateKey: string;
  sm2Status: string;
}

/**
 * Create or update a Google Doc in the user's Drive with their full vocab library.
 * If exportDocId is provided, updates that doc. Otherwise creates a new one.
 * Returns the doc ID.
 */
export async function exportLibraryToGoogleDoc(
  accessToken: string,
  vocab: VocabRow[],
  existingDocId?: string | null
): Promise<string> {
  // Build the document content as plain text
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const grouped: Record<string, VocabRow[]> = {};
  for (const v of vocab) {
    (grouped[v.dateKey] ??= []).push(v);
  }

  const lines: string[] = [
    `Le Dictionnaire — My French Vocabulary Library`,
    `Last updated: ${now}`,
    `Total words: ${vocab.length}`,
    ``,
  ];

  for (const [dateKey, words] of Object.entries(grouped).sort().reverse()) {
    lines.push(`── ${dateKey} ──`);
    for (const w of words) {
      const status = w.sm2Status !== "new" ? ` [${w.sm2Status}]` : "";
      lines.push(`  ${w.term}  →  ${w.translation}${status}`);
    }
    lines.push("");
  }

  const docContent = lines.join("\n");

  if (existingDocId) {
    // Update existing doc: clear it and write new content
    // First, get the document to find its end index
    const getRes = await fetch(`${DOCS_EXPORT_URL(existingDocId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const doc = await getRes.json() as { body?: { content?: Array<{ endIndex?: number }> } };
      const lastBlock = doc.body?.content?.slice(-1)[0];
      const endIndex = (lastBlock?.endIndex ?? 2) - 1;

      if (endIndex > 1) {
        // Delete all existing content
        await fetch(`https://docs.googleapis.com/v1/documents/${existingDocId}:batchUpdate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                deleteContentRange: {
                  range: { startIndex: 1, endIndex },
                },
              },
            ],
          }),
        });
      }

      // Insert new content
      await fetch(`https://docs.googleapis.com/v1/documents/${existingDocId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ insertText: { location: { index: 1 }, text: docContent } }],
        }),
      });

      return existingDocId;
    }
  }

  // Create a new Google Doc via Drive API (multipart upload)
  const metadata = {
    name: "Le Dictionnaire — French Vocabulary Library",
    mimeType: "application/vnd.google-apps.document",
  };

  const boundary = "-------314159265358979323846";
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    docContent,
    `--${boundary}--`,
  ].join("\r\n");

  const createRes = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`,
    },
    body,
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create Google Doc: ${err}`);
  }

  const created = await createRes.json() as { id: string };
  return created.id;
}
