/**
 * Google Drive / Docs helpers
 *
 * - refreshGoogleAccessToken   : use refresh token to get a new access token
 * - getValidAccessToken        : returns a valid access token (refreshes if needed)
 * - fetchGoogleDocText         : export a Google Doc as plain text + revisionId
 * - extractVocabGroups         : extract French words grouped by date/topic using line-batched LLM calls
 * - exportLibraryToGoogleDoc   : create or update a Google Doc with the user's vocab library
 *
 * Extraction strategy (Round 32 rebuild):
 *   1. Split document text into individual lines (split on \n)
 *   2. Regex-detect date headers and topic headers as lines are processed
 *   3. Batch 100–150 lines per LLM call, never breaking mid-line
 *   4. Compact translation-only prompt: LLM returns [{term, translation, kind}] per batch
 *   5. fetchGoogleDocText now returns { text, revisionId } for incremental sync
 */
import { createHash } from "node:crypto";
import * as db from "./db";
import { ENV } from "./_core/env";

// ── LLM callers ───────────────────────────────────────────────────────────────

/**
 * Call DeepSeek-V4-Flash directly, bypassing the Manus built-in LLM quota.
 * deepseek-v4-flash is a reasoning model — it writes its thinking to
 * reasoning_content and the final answer to content. We need enough max_tokens
 * to cover both the reasoning chain and the JSON output.
 */
async function callDeepSeek(messages: { role: string; content: string }[], useJson?: boolean): Promise<string> {
  const body: Record<string, unknown> = {
    model: "deepseek-v4-flash",
    messages,
    // The reasoning chain alone can exceed 8k tokens on a 100+ line batch,
    // which truncated the JSON answer and made every batch parse to [].
    max_tokens: 32768,
  };
  if (useJson) {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.deepseekApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { choices: { finish_reason?: string; message: { content: string } }[] };
  const choice = data.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error("DeepSeek response was truncated (hit max_tokens) — extraction batch too large");
  }
  return choice?.message?.content ?? "[]";
}

/**
 * Call Gemini 2.5 Flash via Google AI Studio API.
 * Requires GOOGLE_AI_API_KEY to be set.
 */
async function callGemini(messages: { role: string; content: string }[]): Promise<string> {
  if (!ENV.googleAiApiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not configured. Please add your Google AI API key in settings.");
  }
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const body = {
    system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
    contents: chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 32768,
      // Gemini 2.5 Flash thinks by default and the thinking tokens count
      // against maxOutputTokens, truncating the JSON answer. Extraction is
      // mechanical translation — no thinking needed.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${ENV.googleAiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { candidates: { finishReason?: string; content: { parts: { text: string }[] } }[] };
  const candidate = data.candidates[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new Error("Gemini response was truncated (hit maxOutputTokens) — extraction batch too large");
  }
  return candidate?.content?.parts?.[0]?.text ?? "[]";
}

// ── Token management ──────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DOCS_API_URL = (docId: string) => `https://docs.googleapis.com/v1/documents/${docId}`;
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

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
 * A document line with the styling signal used for header detection:
 * `styled` is true when the paragraph visually stands out from body text
 * (a named heading/title style, or a font size larger than the body's).
 */
export interface DocLine {
  text: string;
  styled: boolean;
}

/**
 * Fetch a Google Doc and return its plain-text content, per-line styling,
 * plus the document's revisionId (used for incremental sync — skip LLM if
 * doc hasn't changed).
 */
export async function fetchGoogleDocText(
  docId: string,
  accessToken: string
): Promise<{ text: string; revisionId: string | null; lines: DocLine[] }> {
  const res = await fetch(DOCS_API_URL(docId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Google Doc: ${err}`);
  }

  const doc = await res.json() as {
    revisionId?: string;
    body?: {
      content?: Array<{
        paragraph?: {
          paragraphStyle?: { namedStyleType?: string };
          elements?: Array<{
            textRun?: {
              content?: string;
              textStyle?: { fontSize?: { magnitude?: number } };
            };
          }>;
        };
      }>;
    };
  };

  const paras: Array<{ text: string; named: string; maxSize: number | null }> = [];
  for (const block of doc.body?.content ?? []) {
    if (!block.paragraph) continue;
    const runs = block.paragraph.elements ?? [];
    // A manual line break inside a paragraph (Shift+Enter) arrives as \v / \n.
    // Collapse those to a single space so a sentence the user split with a
    // soft break stays one line instead of becoming two vocab entries.
    const text = runs
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .replace(/[\r\n\t\u000B\u2028\u2029 ]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim();
    if (!text) continue;
    const sizes = runs
      .map((el) => el.textRun?.textStyle?.fontSize?.magnitude)
      .filter((s): s is number => typeof s === "number");
    paras.push({
      text: text.trim(),
      named: block.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT",
      maxSize: sizes.length ? Math.max(...sizes) : null,
    });
  }

  // Body font size = the most common explicit size, weighted by text length.
  // Lines whose font is strictly larger stand out visually, like headings do.
  const sizeWeight = new Map<number, number>();
  for (const p of paras) {
    if (p.maxSize !== null) {
      sizeWeight.set(p.maxSize, (sizeWeight.get(p.maxSize) ?? 0) + p.text.length);
    }
  }
  let bodySize: number | null = null;
  let bestWeight = 0;
  sizeWeight.forEach((weight, size) => {
    if (weight > bestWeight) {
      bodySize = size;
      bestWeight = weight;
    }
  });

  const lines: DocLine[] = paras.map((p) => ({
    text: p.text,
    styled:
      (p.named !== "NORMAL_TEXT") ||
      (bodySize !== null && p.maxSize !== null && p.maxSize > bodySize),
  }));

  return {
    text: lines.map((l) => l.text).join("\n"),
    revisionId: doc.revisionId ?? null,
    lines,
  };
}

// ── Line-aligned batching ─────────────────────────────────────────────────────

const BATCH_MIN_LINES = 100;
const BATCH_MAX_LINES = 150;

/**
 * Split an array of lines into batches of 100–150 lines each.
 * Never breaks mid-line (each line is kept intact).
 */
function batchLines(lines: string[]): string[][] {
  const batches: string[][] = [];
  let i = 0;
  while (i < lines.length) {
    // Take up to BATCH_MAX_LINES, but try to end at a natural boundary
    // (blank line or date header) if we're past BATCH_MIN_LINES
    let end = Math.min(i + BATCH_MAX_LINES, lines.length);
    if (end < lines.length && end - i > BATCH_MIN_LINES) {
      // Look backwards for a blank line or date-like header to break on
      for (let j = end - 1; j >= i + BATCH_MIN_LINES; j--) {
        if (!lines[j].trim() || isDateHeader(lines[j])) {
          end = j + 1;
          break;
        }
      }
    }
    batches.push(lines.slice(i, end));
    i = end;
  }
  return batches;
}

// ── Regex date/group detection ────────────────────────────────────────────────

/**
 * Patterns that identify a date header line.
 * Matches: "June 5", "5 juin", "2025-06-05", "Monday June 3", "June 3rd, 2025", etc.
 */
const DATE_PATTERNS = [
  // ISO date: 2025-06-05
  /^\d{4}-\d{2}-\d{2}$/,
  // English: June 5 / June 5, 2025 / Monday June 3 / June 3rd
  /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday,?\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i,
  // French: 5 juin / 5 juin 2025 / lundi 5 juin
  /^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche,?\s+)?\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)(?:\s+\d{4})?$/i,
  // Numeric: 05/06/2025 or 05.06.2025
  /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/,
  // Numeric without year: 15/05 or 15.05 (DD/MM or MM/DD — format inferred doc-wide)
  /^\d{1,2}[./]\d{1,2}$/,
];

function isDateHeader(line: string): boolean {
  const trimmed = line.trim();
  return DATE_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Patterns that identify a topic/theme sub-header line.
 * Matches: "At the restaurant:", "[Chapter 3]", "Verbs:"
 * All-caps lines are NOT treated as labels — in practice they are vocabulary
 * (acronyms, emphasis), not section headers.
 */
const TOPIC_PATTERNS = [
  /^.{2,60}:$/, // ends with colon
  /^\[.{1,60}\]$/, // bracketed
  /^──.+──$/, // our own export format separator
];

function isTopicHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  return TOPIC_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Check if a date string is missing a year component.
 */
export function isYearMissing(rawDate: string): boolean {
  return !/\d{4}/.test(rawDate);
}

// ── Numeric date format inference ─────────────────────────────────────────────

export type NumericDateFormat = "DM" | "MD";

const NUMERIC_DATE_RE = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/;

/**
 * Infer whether numeric date headers in this document use international
 * day/month order ("DM", e.g. 15/05 = May 15) or US month/day order ("MD").
 * A component > 12 can only be a day, so any such header is unambiguous
 * evidence — majority wins across the whole document. With no evidence
 * either way, default to US month/day.
 */
export function detectNumericDateFormat(lines: string[]): NumericDateFormat {
  let dm = 0;
  let md = 0;
  for (const line of lines) {
    const m = line.trim().match(NUMERIC_DATE_RE);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 12 && b <= 12) dm++;
    else if (b > 12 && a <= 12) md++;
  }
  return dm > md ? "DM" : "MD";
}

// ── AI extraction ─────────────────────────────────────────────────────────────

export interface ExtractedWord {
  term: string;
  translation: string;
  kind: "word" | "phrase";
}

export interface ExtractedGroup {
  /** Raw date string as found in the document, e.g. "June 5", "2025-06-05", "5 juin" */
  rawDate: string | null;
  /** Whether the year component is missing and needs user clarification */
  yearMissing: boolean;
  /** Optional topic/theme sub-label, e.g. "At the restaurant", "Chapter 3" */
  topicLabel: string | null;
  words: ExtractedWord[];
}

export type ExtractionModel = "deepseek-v4-flash" | "gemini-2.5-flash";

/**
 * Compact translation-only prompt.
 * The LLM receives a batch of lines and returns a flat JSON array of
 * {term, translation, kind} objects. No date/group detection needed here —
 * that is handled by the regex pre-pass above.
 * This keeps the output small and predictable, avoiding the 8192-token truncation
 * that plagued the old full-document prompt.
 */
async function translateBatch(
  lines: string[],
  model: ExtractionModel
): Promise<ExtractedWord[]> {
  const batchText = lines.join("\n");

  const systemPrompt = `You are a French vocabulary extractor for a language learner's notebook.
Given a list of lines, extract every French word or phrase worth saving to a vocabulary list.

Return a JSON array (no wrapper object) where each element is:
{ "term": "<French word/phrase>", "translation": "<English meaning>", "kind": "word" | "phrase" }

Rules:
- "kind" is "word" for single words or short expressions (≤4 words), "phrase" for longer sentences or full sentences
- SPLIT SENTENCES: occasionally one French sentence has been split across two consecutive lines (the first line ends mid-thought and the next line clearly continues it). When you are confident two consecutive lines form ONE sentence, join them into a single "term". Be conservative — only join when the continuation is obvious (e.g. the first line has no translation of its own and does not stand alone as a complete entry). If each line is a self-contained word or phrase, keep them as separate entries.
- IMPORTANT: Many lines already contain both a French term and its English meaning, separated by characters like —, →, -, :, =, or a tab. For these lines, extract the French part as "term" and the English part as "translation" directly. Do NOT skip these lines.
- For lines that contain only French (no English translation present), translate the French to English yourself.
- Skip lines that are clearly date headers (e.g. "June 5", "5 juin 2025"), page numbers, section titles with no vocabulary, or lines that contain only English with no French.
- Do NOT invent words — only extract what is explicitly present in the text
- Return an empty array [] if no French vocabulary is found
- Return ONLY the JSON array, no markdown, no explanation`;

  const msgs = [
    { role: "system", content: systemPrompt },
    { role: "user", content: batchText },
  ];

  const raw = model === "gemini-2.5-flash"
    ? await callGemini(msgs)
    : await callDeepSeek(msgs, true);

  // The DeepSeek json_object mode wraps arrays in an object sometimes.
  // Handle both {"items":[...]} and [...] responses.
  try {
    const trimmed = raw.trim();
    // Try direct array parse
    if (trimmed.startsWith("[")) {
      return JSON.parse(trimmed) as ExtractedWord[];
    }
    // Try unwrapping common wrapper keys
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const arr = obj.items ?? obj.words ?? obj.vocabulary ?? obj.results ?? Object.values(obj)[0];
    if (Array.isArray(arr)) return arr as ExtractedWord[];
    console.error(`[DriveSync] ${model} returned JSON without a word array:`, raw.slice(0, 200));
    return [];
  } catch (err) {
    // Don't swallow this silently — an unparseable response means the sync is
    // missing words, and "0 found" must not look like a successful sync.
    throw new Error(`${model} returned unparseable JSON (${(err as Error).message}): ${raw.slice(0, 200)}`);
  }
}

/**
 * Parse a raw date string + optional year override into a YYYY-MM-DD dateKey.
 * Returns null if the date cannot be parsed.
 */
export function parseDateKey(
  rawDate: string,
  yearOverride?: number,
  numericFormat: NumericDateFormat = "MD"
): string | null {
  if (!rawDate) return null;
  const currentYear = yearOverride ?? new Date().getFullYear();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  // Numeric dates (15/05, 05/06/2025, 15.05) — JS Date parsing assumes US
  // month/day order and rejects day-first values outright, so handle these
  // explicitly using the document-wide inferred format. A component > 12 is
  // a day regardless of the inferred format.
  const num = rawDate.trim().match(NUMERIC_DATE_RE);
  if (num) {
    const a = parseInt(num[1], 10);
    const b = parseInt(num[2], 10);
    let year = num[3] ? parseInt(num[3], 10) : currentYear;
    if (year < 100) year += 2000;
    let day: number, month: number;
    if (a > 12) [day, month] = [a, b];
    else if (b > 12) [day, month] = [b, a];
    else if (numericFormat === "DM") [day, month] = [a, b];
    else [day, month] = [b, a];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Try native Date parsing with year injected if needed
  const withYear = /\d{4}/.test(rawDate) ? rawDate : `${rawDate} ${currentYear}`;
  const d = new Date(withYear);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  // French month names
  const frMonths: Record<string, number> = {
    janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  };
  const frMatch = rawDate.toLowerCase().match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/);
  if (frMatch) {
    const day = parseInt(frMatch[1]);
    const monthName = frMatch[2];
    const year = frMatch[3] ? parseInt(frMatch[3]) : currentYear;
    const month = frMonths[monthName];
    if (month) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Extract French vocabulary from the full document text using line-aligned batching.
 *
 * Algorithm:
 *   1. Split text into lines
 *   2. Scan lines with regex to detect date headers and topic headers
 *   3. Assign each line a (currentDate, currentTopic) context
 *   4. Batch 100–150 lines per LLM call (never mid-line)
 *   5. Merge LLM results back with the date/topic context for each batch
 *
 * Calls onProgress(batch, total) after each batch.
 * Returns groups with parsed dateKeys and deduplication applied.
 */
export interface LineContext {
  line: string;
  dateKey: string | null;   // raw date string (not yet parsed to YYYY-MM-DD)
  topicLabel: string | null;
}

/**
 * Pre-pass: walk the document lines, detect date/topic headers, and assign
 * each content line the (date, topic) context it falls under.
 *
 * Visual styling takes priority over text patterns: if any styled line
 * (heading/title or larger font) matches a date pattern, then ONLY styled
 * lines can be date headers. This keeps vocabulary that merely looks like a
 * date — e.g. learning to say "11 juillet" — in the content, while the
 * actual section headers ("15/05" styled as TITLE) structure the groups.
 * Docs with no styled date headers fall back to text-pattern detection.
 */
export function preparseLines(allLines: DocLine[]): {
  lineContexts: LineContext[];
  numericDateFormat: NumericDateFormat;
} {
  const hasStyledDates = allLines.some((l) => l.styled && isDateHeader(l.text));

  // Infer DD/MM vs MM/DD only from the lines that actually act as headers.
  const numericDateFormat = detectNumericDateFormat(
    allLines.filter((l) => !hasStyledDates || l.styled).map((l) => l.text)
  );

  let currentRawDate: string | null = null;
  let currentTopic: string | null = null;
  const lineContexts: LineContext[] = [];

  for (const rawLine of allLines) {
    const line = rawLine.text.trim();
    if (!line) continue;

    if (isDateHeader(line) && (!hasStyledDates || rawLine.styled)) {
      currentRawDate = line;
      currentTopic = null; // reset topic on new date
      continue; // don't include the header line itself in LLM batches
    }

    if (isTopicHeader(line)) {
      // Strip trailing colon and brackets
      currentTopic = line.replace(/^[\[\s]+|[\]\s:]+$/g, "").trim() || null;
      continue; // don't include the header line itself in LLM batches
    }

    lineContexts.push({ line, dateKey: currentRawDate, topicLabel: currentTopic });
  }

  return { lineContexts, numericDateFormat };
}

/** A contiguous run of content lines under one date header. */
export interface DocSection {
  rawDate: string | null;
  hash: string;
  lines: LineContext[];
}

/**
 * Split pre-parsed lines into date sections and fingerprint each one.
 * The hash covers the date header and every content line (including
 * English-only lines the LLM will skip), so any edit inside a section —
 * even to a translation line — changes the hash and re-processes the whole
 * section, keeping French/English line pairs together.
 */
export function splitIntoSections(lineContexts: LineContext[]): DocSection[] {
  const sections: DocSection[] = [];
  let current: { rawDate: string | null; lines: LineContext[] } | null = null;

  for (const lc of lineContexts) {
    if (!current || current.rawDate !== lc.dateKey) {
      if (current) sections.push(finishSection(current));
      current = { rawDate: lc.dateKey, lines: [] };
    }
    current.lines.push(lc);
  }
  if (current) sections.push(finishSection(current));
  return sections;

  function finishSection(sec: { rawDate: string | null; lines: LineContext[] }): DocSection {
    const hash = createHash("sha256")
      .update(sec.rawDate ?? "")
      .update("\n")
      .update(sec.lines.map((l) => `${l.topicLabel ?? ""}\t${l.line}`).join("\n"))
      .digest("hex");
    return { rawDate: sec.rawDate, hash, lines: sec.lines };
  }
}

export async function extractVocabGroups(
  text: string,
  existingTerms: Set<string>,
  onProgress?: (batch: number, total: number) => void,
  model: ExtractionModel = "deepseek-v4-flash",
  docLines?: DocLine[],
  knownSectionHashes?: Set<string>
): Promise<{
  groups: Array<ExtractedGroup & { dateKey: string | null }>;
  ambiguousDates: string[];
  numericDateFormat: NumericDateFormat;
  /** Hashes of ALL sections currently in the doc — persist after a successful sync. */
  sectionHashes: string[];
  /** How many sections actually went to the LLM this run. */
  processedSections: number;
}> {
  if (!text.trim()) {
    return { groups: [], ambiguousDates: [], numericDateFormat: "MD", sectionHashes: [], processedSections: 0 };
  }

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // ── Steps 1+2: Split into lines and assign date/topic context per line ────
  // Without styling info (plain-text caller), every line is unstyled and
  // header detection falls back to text patterns alone.
  const allLines: DocLine[] =
    docLines ?? text.split("\n").map((t) => ({ text: t, styled: false }));
  const { lineContexts, numericDateFormat } = preparseLines(allLines);

  // ── Step 2.5: Skip sections already processed in a previous sync ──────────
  // LLM cost scales with new/edited sections instead of full document size.
  const sections = splitIntoSections(lineContexts);
  const sectionHashes = sections.map((sec) => sec.hash);
  const sectionsToProcess = knownSectionHashes
    ? sections.filter((sec) => !knownSectionHashes.has(sec.hash))
    : sections;
  const processLines = sectionsToProcess.flatMap((sec) => sec.lines);

  if (processLines.length === 0) {
    return { groups: [], ambiguousDates: [], numericDateFormat, sectionHashes, processedSections: 0 };
  }

  // ── Step 3: Batch lines for LLM ──────────────────────────────────────────
  // We batch the actual content lines (not headers) into groups of 100–150.
  const contentLines = processLines.map((lc) => lc.line);
  const batches = batchLines(contentLines);
  const totalBatches = batches.length;

  // ── Step 4: LLM translation per batch ────────────────────────────────────
  // Build a map from line text → {dateKey, topicLabel} for result attribution.
  // (If the same line appears multiple times, last context wins — acceptable.)
  const lineToContext = new Map<string, { dateKey: string | null; topicLabel: string | null }>();
  for (const lc of processLines) {
    lineToContext.set(lc.line, { dateKey: lc.dateKey, topicLabel: lc.topicLabel });
  }

  // Group key for accumulating words
  const groupMap = new Map<string, ExtractedGroup>();
  const groupOrder: string[] = []; // preserve insertion order

  const seen = new Set<string>(existingTerms);

  // Run LLM calls a few at a time — they are independent, and sequential
  // execution made syncs take minutes. Results are merged in batch order
  // below so grouping and dedup stay deterministic.
  const BATCH_CONCURRENCY = 3;
  const batchResults: ExtractedWord[][] = new Array(batches.length);
  let nextBatch = 0;
  let completedBatches = 0;
  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, async () => {
      while (true) {
        const i = nextBatch++;
        if (i >= batches.length) break;
        batchResults[i] = await translateBatch(batches[i], model);
        completedBatches++;
        onProgress?.(completedBatches, totalBatches);
      }
    })
  );

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const words = batchResults[batchIdx];

    // Attribute each extracted word to the context of the batch's first line
    // that matches the word's term (best-effort). If not found, use the context
    // of the first line in the batch.
    const firstLineCtx = lineToContext.get(batch[0]) ?? { dateKey: null, topicLabel: null };

    for (const word of words) {
      if (!word.term || !word.translation) continue;
      const normTerm = normalize(word.term);
      if (seen.has(normTerm)) continue;
      seen.add(normTerm);

      // Try to find the source line to get its context
      let ctx = firstLineCtx;
      for (const batchLine of batch) {
        if (normalize(batchLine).includes(normTerm)) {
          ctx = lineToContext.get(batchLine) ?? firstLineCtx;
          break;
        }
      }

      const rawDate = ctx.dateKey;
      const topicLabel = ctx.topicLabel;
      const groupKey = `${rawDate ?? "__none__"}::${topicLabel ?? "__none__"}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          rawDate,
          yearMissing: rawDate ? isYearMissing(rawDate) : false,
          topicLabel,
          words: [],
        });
        groupOrder.push(groupKey);
      }

      groupMap.get(groupKey)!.words.push({
        term: word.term,
        translation: word.translation,
        kind: word.kind === "phrase" ? "phrase" : "word",
      });
    }

  }

  // ── Step 5: Build output ──────────────────────────────────────────────────
  const ambiguousDates = Array.from(
    new Set(
      groupOrder
        .map((k) => groupMap.get(k)!.rawDate)
        .filter((d): d is string => d !== null && isYearMissing(d))
    )
  );

  const processedGroups: Array<ExtractedGroup & { dateKey: string | null }> = [];
  for (const key of groupOrder) {
    const group = groupMap.get(key)!;
    if (group.words.length === 0) continue;
    const dateKey = group.rawDate ? parseDateKey(group.rawDate, undefined, numericDateFormat) : null;
    processedGroups.push({ ...group, dateKey });
  }

  return { groups: processedGroups, ambiguousDates, numericDateFormat, sectionHashes, processedSections: sectionsToProcess.length };
}

/**
 * Backward-compat wrapper used by the cron job.
 * Returns a flat list of words (no grouping).
 */
export async function extractVocabFromText(
  text: string,
  existingTerms: Set<string>,
  onProgress?: (batch: number, total: number) => void,
  docLines?: DocLine[]
): Promise<ExtractedWord[]> {
  const { groups } = await extractVocabGroups(text, existingTerms, onProgress, undefined, docLines);
  return groups.flatMap((g) => g.words);
}

// ── Google Doc export ─────────────────────────────────────────────────────────

interface VocabRow {
  term: string;
  translation: string;
  entryKind: string;
  dateKey: string;
  sm2Status: string;
  groupLabel?: string | null;
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
    const byLabel: Record<string, VocabRow[]> = {};
    for (const w of words) {
      const label = w.groupLabel ?? "";
      (byLabel[label] ??= []).push(w);
    }
    for (const [label, labelWords] of Object.entries(byLabel)) {
      if (label) lines.push(`  [${label}]`);
      for (const w of labelWords) {
        const status = w.sm2Status !== "new" ? ` [${w.sm2Status}]` : "";
        lines.push(`  ${w.term}  →  ${w.translation}${status}`);
      }
    }
    lines.push("");
  }

  const docContent = lines.join("\n");

  if (existingDocId) {
    const getRes = await fetch(DOCS_API_URL(existingDocId), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const doc = await getRes.json() as { body?: { content?: Array<{ endIndex?: number }> } };
      const lastBlock = doc.body?.content?.slice(-1)[0];
      const endIndex = (lastBlock?.endIndex ?? 2) - 1;

      if (endIndex > 1) {
        await fetch(`https://docs.googleapis.com/v1/documents/${existingDocId}:batchUpdate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [{ deleteContentRange: { range: { startIndex: 1, endIndex } } }],
          }),
        });
      }

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
