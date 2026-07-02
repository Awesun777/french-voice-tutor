import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { dictCache as dictCacheTable } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { B1_VERBS, TENSES, TENSE_KEYS, PERSONS, assembleGrammarQuestions, type TenseKey, type VerbPick, type RawGeneratedItem } from "./grammarVerbs";
import {
  addVocabEntries,
  addVocabEntry,
  clearTutorHistory,
  countPendingImports,
  createVoiceSession,
  deleteGoogleAccount,
  deleteVocabEntry,
  endVoiceSession,
  getGoogleAccountByUserId,
  getGoogleDriveSettings,
  getPendingImports,
  getQuizSessions,
  getTutorHistory,
  getVocabByUser,
  getVoiceSessions,
  getVocabStats,
  getUserMemory,
  insertPendingImports,
  updateUserMemory,
  saveQuizSession,
  saveTutorMessage,
  toggleVocabStar,
  updateVocabEntry,
  renameVocabGroup,
  deleteVocabGroup,
  getDueVocab,
  getReviewQueue,
  getReviewDates,
  submitSm2Review,
  submitQuizResult,
  getSm2Stats,
  getReviewSettings,
  updateReviewSettings,
  updatePendingImportStatus,
  bulkUpdatePendingImportsByDateKey,
  upsertGoogleDriveSettings,
  getPendingImportById,
} from "./db";
import {
  extractDocId,
  extractVocabFromText,
  exportLibraryToGoogleDoc,
  fetchGoogleDocText,
  getValidAccessToken,
  parseDateKey,
  detectNumericDateFormat,
} from "./googleDrive";

// ─── Dictionary search cache (DB-persisted + in-memory L1) ───────────────────
// L1: in-memory Map for ultra-fast repeated lookups within the same process.
// L2: dict_cache table — survives redeploys, shared across all users.
const memCache = new Map<string, unknown>();

async function getCached(key: string): Promise<unknown | null> {
  if (memCache.has(key)) return memCache.get(key)!;
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(dictCacheTable).where(eq(dictCacheTable.termKey, key));
    if (rows.length > 0) {
      const result = JSON.parse(rows[0].entryJson);
      memCache.set(key, result); // warm L1
      return result;
    }
  } catch { /* non-fatal */ }
  return null;
}
async function setCache(key: string, result: unknown) {
  memCache.set(key, result);
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(dictCacheTable)
      .values({ termKey: key, entryJson: JSON.stringify(result), createdAt: Date.now() })
      .onDuplicateKeyUpdate({ set: { entryJson: JSON.stringify(result), createdAt: Date.now() } });
  } catch { /* non-fatal — cache write failure should not break the response */ }
}

// The "heavy" dictionary fields, shared by the full word schema and the
// separate searchDetails endpoint so the two stay in lockstep.
const DETAILS_SCHEMA_PROPS = {
  conjugations: {
    type: "object",
    properties: {
      present:      { type: "array", items: { type: "string" } },
      imparfait:    { type: "array", items: { type: "string" } },
      passeCompose: { type: "array", items: { type: "string" } },
      futurSimple:  { type: "array", items: { type: "string" } },
      conditionnel: { type: "array", items: { type: "string" } },
      subjonctif:   { type: "array", items: { type: "string" } },
    },
    required: ["present", "imparfait", "passeCompose", "futurSimple", "conditionnel", "subjonctif"],
    additionalProperties: false,
  },
  synonyms: {
    type: "array",
    items: { type: "object", properties: { word: { type: "string" }, meaning: { type: "string" } }, required: ["word", "meaning"], additionalProperties: false },
  },
  confusingWords: {
    type: "array",
    items: { type: "object", properties: { word: { type: "string" }, meaning: { type: "string" }, difference: { type: "string" } }, required: ["word", "meaning", "difference"], additionalProperties: false },
  },
} as const;

// ─── AI import cache (per-chunk) ──────────────────────────────────────────────
const importCache = new Map<string, unknown[]>();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayKey() { return new Date().toISOString().split("T")[0]; }

/**
 * Shared LLM extraction prompt for the paste-import and Google-Doc-URL paths.
 *
 * The model returns the date header VERBATIM ("dateHeader") rather than a
 * computed calendar date — LLMs are unreliable at date arithmetic (e.g. they
 * turn "12/06" into 2026-06-13). The server then parses the raw header with the
 * deterministic parseDateKey (see resolveImportDateKeys). The model's own
 * best-guess "dateKey" is kept only as a fallback for headers we can't parse.
 */
function buildExtractPrompt(extraRules: string, text: string): string {
  return `You are a French language teacher's assistant. Extract all distinct French vocabulary words and phrases from the text below.
The text may contain date headers (e.g. "March 15", "2024-03-15", "12/06", "Lesson 3 - Monday", "Week 2", "Jan 5th") that separate vocabulary sections. For each word, report the date header that appears above it.
Ignore headings, titles, page numbers, and purely English metadata that are NOT vocabulary.
Focus only on French words, expressions, and sentences a student would want to learn.
${extraRules}
Rules:
- "term": French word or phrase WITH accents preserved
- "translation": English meaning, brief (1-6 words)
- "kind": "word" for single words or 2-word expressions; "phrase" for 3+ word expressions or full sentences
- "dateHeader": copy the date-header text above this word EXACTLY as written, character-for-character (e.g. "12/06", "March 15", "Semaine 2"). Do NOT convert it to another format. Use "today" if there is no date header above the word.
- "dateKey": your best-guess YYYY-MM-DD for that header, or "today" if none. (Used only as a fallback — the server normally computes the date from "dateHeader".)
Return ONLY a JSON object with an "items" array. Example:
{"items":[{"term":"bonjour","translation":"hello","kind":"word","dateHeader":"March 15","dateKey":"2026-03-15"},{"term":"Comment allez-vous ?","translation":"How are you?","kind":"phrase","dateHeader":"today","dateKey":"today"}]}

Text:
${text.slice(0, 20000)}`;
}

interface ExtractedImportItem {
  term: string;
  translation: string;
  kind: string;
  dateHeader?: string;
  dateKey?: string;
}

/**
 * Turn each item's raw "dateHeader" into a concrete dateKey deterministically,
 * matching the Drive-sync path: a component > 12 means day-first, otherwise the
 * doc-wide majority (DD/MM vs MM/DD) decides. Falls back to the LLM's own
 * dateKey guess (if a valid ISO date) and finally to today when there is no
 * header or it can't be parsed.
 */
function resolveImportDateKeys<T extends ExtractedImportItem>(items: T[]): (T & { dateKey: string })[] {
  const todayStr = todayKey();
  const headers = items
    .map((i) => i.dateHeader)
    .filter((h): h is string => !!h && h.trim().toLowerCase() !== "today");
  const fmt = detectNumericDateFormat(headers);
  return items.map((item) => {
    const header = item.dateHeader?.trim();
    let dk: string | null = null;
    if (header && header.toLowerCase() !== "today") {
      dk = parseDateKey(header, undefined, fmt);
    }
    if (!dk) {
      dk = item.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(item.dateKey) && item.dateKey !== "today"
        ? item.dateKey
        : todayStr;
    }
    return { ...item, dateKey: dk };
  });
}

// ─── Routers ──────────────────────────────────────────────────────────────────
/** Verb-like infinitive endings, used to pick verb candidates out of vocab. */
const VERB_ENDING = /(?:er|ir|re|oir)$/i;

export const appRouter = router({
  system: systemRouter,

  // ─── Grammar Test ────────────────────────────────────────────────────────────
  grammar: router({
    /**
     * Generate a set of fill-in-the-blank conjugation questions for the chosen
     * tenses. Verbs are drawn from the user's own vocab (verb-like entries) plus
     * a curated B1 bank. Each question anchors on a specific (verb, tense,
     * person); the LLM writes a natural sentence with that form blanked out and
     * returns the exact form, which the client grades against (accents optional).
     */
    generateTest: protectedProcedure
      .input(z.object({
        tenses: z.array(z.enum(TENSE_KEYS as [TenseKey, ...TenseKey[]])).min(1),
        count: z.number().min(1).max(20).default(10),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verb pool: the user's verb-like vocab words + the B1 bank, deduped.
        const vocab = await getVocabByUser(ctx.user.id);
        const vocabVerbs = vocab
          .filter((v) => v.entryKind === "word" && VERB_ENDING.test(v.term.trim()) && !v.term.includes(" "))
          .map((v) => v.term.trim().toLowerCase());
        const pool = Array.from(new Set([...vocabVerbs, ...B1_VERBS]));
        // Fisher–Yates shuffle.
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        // Pre-select (verb, tense, person) tuples so we control the mix.
        // Over-generate a buffer so that after dropping any non-verbs / malformed
        // items we can still return the requested count.
        const tenseLabel = (k: TenseKey) => TENSES.find((t) => t.key === k)!.instruction;
        const genCount = Math.min(input.count + 5, pool.length);
        const picks: VerbPick[] = Array.from({ length: genCount }, (_, i) => {
          const infinitive = pool[i % pool.length];
          const tense = input.tenses[Math.floor(Math.random() * input.tenses.length)];
          const person = Math.floor(Math.random() * PERSONS.length);
          return { infinitive, tense, person };
        });

        const prompt = `You are a French teacher creating B1-level fill-in-the-blank conjugation exercises.
You are given a numbered list of items. Each names a CANDIDATE French verb (infinitive), a target tense, and a subject pronoun.

For each item, return an object with these keys:
- "n": the item number, copied exactly.
- "infinitive": the exact infinitive you conjugated.
- "isVerb": true only if the candidate word is a real, conjugable French verb. If it is actually an adjective, noun, or anything that cannot be conjugated (e.g. "autoritaire", "dictionnaire"), set "isVerb": false. NEVER substitute a different verb — just flag it and leave "sentence" and "answer" empty.
- "sentence": ONE complete, natural French sentence at B1 level that gives real CONTEXT — a time, place, object, or reason — so the exercise is a full sentence, NOT just a subject and a blank. Replace ONLY the conjugated target verb with "___" (three underscores) and keep the rest of the sentence intact. For passé composé include the auxiliary (e.g. "ai voyagé"); for pronominal verbs include the reflexive pronoun (e.g. "me suis levé"). Example (verb "voyager", passé composé, subject je): "L'été dernier, j'___ en Italie avec toute ma famille." with answer "ai voyagé".
  CRITICAL — TENSE FIDELITY: the sentence's context MUST require the blank to be in the REQUESTED tense, and "answer" MUST be that verb conjugated in the REQUESTED tense. Do NOT write a sentence whose grammar forces a different mood/tense. In particular, unless the requested tense is the subjonctif, do NOT use subjunctive triggers before the blank such as "il faut que", "il est important que", "bien que", "pour que", "avant que", "vouloir que", "à condition que". Example: for imparfait of "manger" the answer is "mangeait" (NOT "mange").
- "answer": exactly the text that fills the "___", correctly conjugated.
- "english": brief English translation of the completed sentence.

Return ONLY JSON: {"questions":[{"n":1,"infinitive":"...","isVerb":true,"sentence":"French sentence with ___","answer":"...","english":"..."}]}
Return one object per item, in the original order. Make each sentence idiomatic and give it enough context to feel natural (roughly 6–12 words); NEVER return just a subject followed by the blank.

Items:
${picks.map((p, i) => `${i + 1}. verb "${p.infinitive}" — tense ${tenseLabel(p.tense)} — subject ${PERSONS[p.person]}`).join("\n")}`;

        const resp = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" } as any,
        });
        const raw = resp.choices[0].message.content ?? "{}";
        let generated: RawGeneratedItem[] = [];
        try {
          const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
          if (Array.isArray(parsed.questions)) generated = parsed.questions;
        } catch { /* fall through to empty */ }

        const questions = assembleGrammarQuestions(picks, generated, input.count);

        return { questions };
      }),
  }),

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Dictionary ─────────────────────────────────────────────────────────────
  dictionary: router({
    suggest: protectedProcedure
      .input(z.object({ term: z.string().min(1).max(200) }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          messages: [
            {
              role: "user",
              content: `The user searched for "${input.term}" in a French-English dictionary but it was not found or appears misspelled.
Suggest 1-2 real French words or phrases that the user most likely intended.
Return ONLY this JSON:
{"suggestions":[{"term":"correct French word/phrase WITH accents","translation":"English meaning","confidence":"high|medium"},{"term":"...","translation":"...","confidence":"..."}]}
If no plausible suggestion exists, return {"suggestions":[]}.`,
            },
          ],
          response_format: { type: "json_object" } as any,
        });
        const raw = response.choices[0].message.content ?? '{"suggestions":[]}';
        const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
        try {
          const parsed = JSON.parse(str);
          return { suggestions: (parsed.suggestions ?? []).slice(0, 2) as { term: string; translation: string; confidence: string }[] };
        } catch {
          return { suggestions: [] };
        }
      }),
    search: protectedProcedure
      .input(z.object({
        term: z.string().min(1).max(300),
        // "quick" omits the heavy folded fields (conjugations/synonyms/confusing)
        // for a much faster first paint; "full" is the complete entry (default,
        // so existing callers are unchanged).
        parts: z.enum(["quick", "full"]).default("full"),
      }))
      .mutation(async ({ input }) => {
        const key = input.term.toLowerCase().trim() + (input.parts === "quick" ? "::q" : "");
        const cached = await getCached(key);
        if (cached) return cached;

        const type = detectInputType(input.term);

        // Build messages + structured response_format per input type
        let messages: { role: "system" | "user"; content: string }[];
        let responseFormat: unknown;

        if (type === "question") {
          messages = [
            { role: "system", content: "You are a helpful French-English language assistant. Return only valid JSON." },
            { role: "user", content: `Answer this French language question: "${input.term}". Return JSON with these exact keys: type (string, always "question"), question (string, restate the question clearly), answer (string, detailed helpful answer), options (array of 3 objects each with keys: french, english, summary).` },
          ];
          responseFormat = {
            type: "json_schema",
            json_schema: {
              name: "question_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  question: { type: "string" },
                  answer: { type: "string" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        french: { type: "string" },
                        english: { type: "string" },
                        summary: { type: "string" },
                      },
                      required: ["french", "english", "summary"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["type", "question", "answer", "options"],
                additionalProperties: false,
              },
            },
          };
        } else if (type === "phrase") {
          messages = [
            { role: "system", content: "You are a precise French-English dictionary. Return only valid JSON." },
            { role: "user", content: `Look up this French phrase: "${input.term}". The user may have omitted accents; return proper French WITH accents. Provide a complete dictionary entry.` },
          ];
          responseFormat = {
            type: "json_schema",
            json_schema: {
              name: "phrase_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  found: { type: "boolean" },
                  phrase: { type: "string" },
                  translation: { type: "string" },
                  pronunciation: { type: "string" },
                  literalTranslation: { type: "string" },
                  usage: { type: "string" },
                  examples: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { fr: { type: "string" }, en: { type: "string" } },
                      required: ["fr", "en"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["type", "found", "phrase", "translation", "pronunciation", "literalTranslation", "usage", "examples"],
                additionalProperties: false,
              },
            },
          };
        } else {
          const wantDetails = input.parts === "full";
          // In "quick" mode we omit the heavy fields (conjugations/synonyms/
          // confusing) so the first paint is fast; they are fetched separately
          // via searchDetails and merged in on the client.
          const detailsInstruction = wantDetails
            ? `Provide a complete dictionary entry including all conjugation tenses (present, imparfait, passeCompose, futurSimple, conditionnel, subjonctif) each as an array of exactly 6 conjugated forms (je/tu/il-elle/nous/vous/ils-elles). For reflexive verbs like se promener, include the reflexive pronoun in each conjugated form (e.g. "je me promène"). Also provide 3-5 synonyms and 1-2 confusing words.`
            : `Do NOT include conjugations, synonyms, or confusing words in this response.`;
          // Single word — use json_schema so special chars in conjugations never break JSON parsing
          messages = [
            { role: "system", content: "You are a precise French-English dictionary. Always set the \"type\" field to exactly the string \"word\". Return only valid JSON matching the schema exactly." },
            { role: "user", content: `Look up the French word: "${input.term}". The user may have omitted accents; return proper French WITH accents. IMPORTANT: (1) set the "type" field to exactly "word". (2) The "word" field MUST always be the canonical base form (infinitive for verbs, masculine singular for adjectives/nouns) — NEVER a conjugated, gendered, or plural form. For example: if the user types "allées" return "aller"; if they type "belle" return "beau"; if they type "allé" return "aller". (3) If the searched term differs from the base form, set isConjugated to true and explain the transformation in conjugationInfo and formExplanation.

REFLEXIVE FIELDS (for verbs): set "isReflexive" true only if the base form is pronominal (has "se"/"s'", e.g. se souvenir). Set "hasReflexiveForm" true if the verb is normally non-reflexive but also has a common pronominal use (e.g. "laver" → "se laver", "appeler" → "s'appeler"). When either is true, fill "reflexiveForm" (e.g. "se laver") and "nonReflexiveForm" (e.g. "laver"), set "reflexiveType" (e.g. "reflexive", "reciprocal", "idiomatic"), and in "reflexiveExplanation" explain in English what the reflexive form means and how it differs from the plain verb. If the word is not a verb or has no reflexive use, set isReflexive and hasReflexiveForm to false and leave those string fields empty.

GOVERNED PREPOSITION (for verbs): set "governedPreposition" to the preposition the verb normally requires before its complement — "à" (e.g. jouer à, penser à, téléphoner à, réussir à), "de" (e.g. se souvenir de, parler de, avoir besoin de, décider de), or "" (empty) if it takes a direct object with no preposition (e.g. regarder, écouter, attendre) or isn't a verb. In "prepositionExplanation" briefly explain the pattern with a short example, especially when it differs from English (e.g. "attendre takes no preposition, unlike English 'wait FOR'"). Leave prepositionExplanation empty when governedPreposition is "".

Provide 2 example sentences. ${detailsInstruction} If the input is not a real French word, set found to false and leave other fields as empty strings or empty arrays.` },
          ];
          const wordProps: Record<string, unknown> = {
            type: { type: "string", enum: ["word"] },
            found: { type: "boolean" },
            word: { type: "string" },
            isConjugated: { type: "boolean" },
            conjugationInfo: { type: "string" },
            baseForm: { type: "string" },
            formExplanation: { type: "string" },
            translation: { type: "string" },
            pronunciation: { type: "string" },
            wordType: { type: "string" },
            isReflexive: { type: "boolean" },
            reflexiveType: { type: "string" },
            reflexiveExplanation: { type: "string" },
            hasReflexiveForm: { type: "boolean" },
            governedPreposition: { type: "string", enum: ["à", "de", ""] },
            prepositionExplanation: { type: "string" },
            reflexiveForm: { type: "string" },
            nonReflexiveForm: { type: "string" },
            grammar: { type: "string" },
            examples: {
              type: "array",
              items: {
                type: "object",
                properties: { fr: { type: "string" }, en: { type: "string" } },
                required: ["fr", "en"],
                additionalProperties: false,
              },
            },
          };
          const wordRequired = [
            "type", "found", "word", "isConjugated", "conjugationInfo", "baseForm",
            "formExplanation", "translation", "pronunciation", "wordType",
            "isReflexive", "reflexiveType", "reflexiveExplanation", "hasReflexiveForm",
            "governedPreposition", "prepositionExplanation", "reflexiveForm", "nonReflexiveForm",
            "grammar", "examples",
          ];
          if (wantDetails) {
            Object.assign(wordProps, DETAILS_SCHEMA_PROPS);
            wordRequired.push("conjugations", "synonyms", "confusingWords");
          }
          responseFormat = {
            type: "json_schema",
            json_schema: {
              name: "word_result",
              strict: true,
              schema: { type: "object", properties: wordProps, required: wordRequired, additionalProperties: false },
            },
          };
        }

        const response = await invokeLLM({
          messages,
          response_format: responseFormat as any,
        });

        const rawContent = response.choices[0].message.content ?? "{}";
        const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        let result: Record<string, unknown>;
        try {
          result = JSON.parse(raw);
        } catch {
          // Last-resort: strip markdown fences and retry
          try {
            result = JSON.parse(raw.trim().replace(/^```json\n?|```\n?$/g, ""));
          } catch {
            result = { type: "error", message: "Could not parse AI response. Please try again." };
          }
        }
        // Normalise the type field — the AI sometimes returns its own names
        // (e.g. "dictionaryEntry", "word_result") instead of the expected values.
        if (result.type !== "word" && result.type !== "phrase" && result.type !== "question" && result.type !== "error") {
          result.type = type; // fall back to the detected input type
        }
        await setCache(key, result);
        return result;
      }),

    // The "heavy" half of a word entry (conjugations / synonyms / confusing
    // words), fetched in the background after a quick search so the folded
    // sections fill in without blocking the first paint.
    searchDetails: protectedProcedure
      .input(z.object({ word: z.string().min(1).max(120) }))
      .mutation(async ({ input }) => {
        const key = "details::" + input.word.toLowerCase().trim();
        const cached = await getCached(key);
        if (cached) return cached;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are a precise French-English dictionary. Return only valid JSON matching the schema exactly." },
            { role: "user", content: `For the French word "${input.word}" (already the canonical base form), return ONLY: all conjugation tenses (present, imparfait, passeCompose, futurSimple, conditionnel, subjonctif), each an array of exactly 6 forms (je/tu/il-elle/nous/vous/ils-elles) — for reflexive verbs include the reflexive pronoun in each form (e.g. "je me promène"), and if it is NOT a verb leave every tense array empty; plus 3-5 synonyms and 1-2 confusing words. Return proper French WITH accents.` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "word_details",
              strict: true,
              schema: {
                type: "object",
                properties: { ...DETAILS_SCHEMA_PROPS },
                required: ["conjugations", "synonyms", "confusingWords"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const rawContent = response.choices[0].message.content ?? "{}";
        const raw = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        let result: Record<string, unknown>;
        try {
          result = JSON.parse(raw);
        } catch {
          try {
            result = JSON.parse(raw.trim().replace(/^```json\n?|```\n?$/g, ""));
          } catch {
            result = { conjugations: { present: [], imparfait: [], passeCompose: [], futurSimple: [], conditionnel: [], subjonctif: [] }, synonyms: [], confusingWords: [] };
          }
        }
        await setCache(key, result);
        return result;
      }),
  }),

  // ─── Vocabulary ──────────────────────────────────────────────────────────────
  vocab: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getVocabByUser(ctx.user.id);
    }),

    add: protectedProcedure
      .input(
        z.object({
          term: z.string().min(1).max(512),
          translation: z.string().min(1).max(512),
          entryKind: z.enum(["word", "phrase"]).default("word"),
          lessonSource: z.string().max(256).optional(),
          dateKey: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = await addVocabEntry(ctx.user.id, {
          ...input,
          dateKey: input.dateKey ?? todayKey(),
        });
        return { id };
      }),

    bulkAdd: protectedProcedure
      .input(
        z.array(
          z.object({
            term: z.string().min(1).max(512),
            translation: z.string().min(1).max(512),
            entryKind: z.enum(["word", "phrase"]).default("word"),
            lessonSource: z.string().max(256).optional(),
            dateKey: z.string().max(100).optional(),
          })
        )
      )
      .mutation(async ({ ctx, input }) => {
        await addVocabEntries(
          ctx.user.id,
          input.map((e) => ({ ...e, dateKey: e.dateKey ?? todayKey() }))
        );
        return { count: input.length };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          term: z.string().min(1).max(512).optional(),
          translation: z.string().min(1).max(512).optional(),
          entryKind: z.enum(["word", "phrase"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        await updateVocabEntry(ctx.user.id, id, patch);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteVocabEntry(ctx.user.id, input.id);
        return { success: true };
      }),

    toggleStar: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await toggleVocabStar(ctx.user.id, input.id);
        return { success: true };
      }),

    /**
     * Merge two vocab entries — used by the flashcard "merge with previous"
     * button to rejoin a sentence the doc split across two cards. The current
     * entry's French is appended to the previous one's, the combined phrase is
     * re-translated for accuracy, and the current entry is deleted.
     */
    mergeIntoPrevious: protectedProcedure
      .input(z.object({ currentId: z.number(), previousId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const all = await getVocabByUser(ctx.user.id);
        const current = all.find((w) => w.id === input.currentId);
        const previous = all.find((w) => w.id === input.previousId);
        if (!current || !previous) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Word not found" });
        }

        const mergedTerm = `${previous.term} ${current.term}`.replace(/\s+/g, " ").trim();

        // Re-translate the combined phrase; fall back to joining the two
        // existing translations if the LLM call fails.
        let translation = `${previous.translation} ${current.translation}`.replace(/\s+/g, " ").trim();
        try {
          const resp = await invokeLLM({
            messages: [{
              role: "user",
              content: `Translate this French phrase to English. Return ONLY JSON: {"translation":"concise English meaning"}\nFrench: "${mergedTerm}"`,
            }],
            response_format: { type: "json_object" } as any,
          });
          const raw = resp.choices[0].message.content ?? "{}";
          const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
          if (parsed.translation) translation = parsed.translation;
        } catch {
          // keep the concatenated fallback
        }

        await updateVocabEntry(ctx.user.id, previous.id, {
          term: mergedTerm,
          translation,
          entryKind: "phrase",
        });
        await deleteVocabEntry(ctx.user.id, current.id);

        return { id: previous.id, term: mergedTerm, translation };
      }),

    updateQuizProgress: protectedProcedure
      .input(
        z.array(
          z.object({
            id: z.number(),
            quizCount: z.number(),
            wrongCount: z.number().optional(),
            lastQuizzed: z.date(),
          })
        )
      )
      .mutation(async ({ ctx, input }) => {
        await Promise.all(
          input.map((item) =>
            updateVocabEntry(ctx.user.id, item.id, {
              quizCount: item.quizCount,
              wrongCount: item.wrongCount,
              lastQuizzed: item.lastQuizzed,
            })
          )
        );
        return { success: true };
      }),
    renameGroup: protectedProcedure
      .input(
        z.object({
          oldDateKey: z.string().max(100),
          newDateKey: z.string().min(1).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await renameVocabGroup(ctx.user.id, input.oldDateKey, input.newDateKey);
        return { success: true };
      }),
    deleteGroup: protectedProcedure
      .input(z.object({ dateKey: z.string().max(100) }))
      .mutation(async ({ ctx, input }) => {
        await deleteVocabGroup(ctx.user.id, input.dateKey);
        return { success: true };
      }),
  }),

  // ─── Quiz ────────────────────────────────────────────────────────────────────
  quiz: router({
    saveSession: protectedProcedure
      .input(
        z.object({
          score: z.number(),
          total: z.number(),
          direction: z.enum(["fr2en", "en2fr"]),
          bucketStart: z.string().max(100).optional(),
          bucketEnd: z.string().max(100).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await saveQuizSession({ userId: ctx.user.id, ...input });
        return { success: true };
      }),

    history: protectedProcedure.query(async ({ ctx }) => {
      return getQuizSessions(ctx.user.id);
    }),

     gradeAnswer: protectedProcedure
      .input(
        z.object({
          userAnswer: z.string(),
          correctAnswer: z.string(),
          term: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        // Normalize both answers for a fast exact-match check before calling the LLM.
        // This handles the most common case (accent/case differences) without an LLM call.
        const normalize = (s: string) =>
          s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalize(input.userAnswer) === normalize(input.correctAnswer)) {
          return { correct: true, note: "", grammarNote: "" };
        }

        const prompt = `You are a French language teacher grading a student's answer.

French term being tested: "${input.term}"
Expected answer: "${input.correctAnswer}"
Student's answer: "${input.userAnswer}"

Grading rules:
- Accents are ALWAYS optional — "etudier" = "étudier" ✓, "a" = "à" ✓, "ou" = "ù" ✓
- Case is ALWAYS ignored — "Bonjour" = "bonjour" ✓
- Minor unambiguous spelling variations are OK
- Wrong word = incorrect
- Completely missing answer = incorrect

If the answer is WRONG, provide:
1. "note": a short correction (e.g. "The correct answer is: se promener")
2. "grammarNote": a specific grammar explanation of WHY it is wrong. Be precise and educational. Examples:
   - "You forgot the reflexive pronoun — se promener is a pronominal verb and always needs 'se' (or me/te/nous/vous) before it."
   - "The past participle must agree in gender: 'allée' for feminine subjects, not 'allé'."
   - "This verb uses être, not avoir, in the passé composé because it expresses movement."
   - "The subjunctive is required after 'il faut que' — use 'aille' not 'va'."
   - "Adjective agreement: the noun is feminine plural, so the adjective needs the -es ending."
   - "You used the infinitive instead of the conjugated form — conjugate for the subject 'nous'."
   If the error is simply a wrong word with no specific grammar issue, set grammarNote to empty string.

If the answer is CORRECT, set note and grammarNote to empty strings.

Return ONLY this JSON: {"correct": true/false, "note": "...", "grammarNote": "..."}`;
        const response = await invokeLLM({
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" } as any,
        });
        const gradeRaw = response.choices[0].message.content ?? '{"correct":false,"note":"","grammarNote":""}';
        const gradeStr = typeof gradeRaw === 'string' ? gradeRaw : JSON.stringify(gradeRaw);
        return JSON.parse(gradeStr) as { correct: boolean; note: string; grammarNote: string };
      }),
  }),

  // ─── AI Import ───────────────────────────────────────────────────────────────
  import: router({
    extractFromText: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(20000),
          instructions: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const cacheKey = input.text.slice(0, 200) + (input.instructions ?? "");
        if (importCache.has(cacheKey)) return { items: importCache.get(cacheKey)! };

        // Step 1: Correct typos
        let correctedText = input.text;
        let corrections: { original: string; fixed: string; note: string }[] = [];
        try {
          const corrResp = await invokeLLM({
            messages: [
              {
                role: "user",
                content: `You are a French language proofreader. Correct typos, wrong accents, and clear grammar mistakes in the French text below. Keep structure and non-French parts EXACTLY the same. Return ONLY this JSON:
{"corrected":"full corrected text","corrections":[{"original":"bonjure","fixed":"bonjour","note":"spelling"}]}

Text:
${input.text.slice(0, 20000)}`,
              },
            ],
            response_format: { type: "json_object" } as any,
          });
          const corrRaw = corrResp.choices[0].message.content ?? "{}";
          const corrStr = typeof corrRaw === 'string' ? corrRaw : JSON.stringify(corrRaw);
          const parsed = JSON.parse(corrStr);
          if (parsed.corrected) correctedText = parsed.corrected;
          if (Array.isArray(parsed.corrections)) corrections = parsed.corrections;
        } catch {
          // Non-fatal
        }

        // Step 2: Extract vocabulary
        const extraRules = input.instructions?.trim()
          ? `\nAdditional instructions: ${input.instructions.trim()}\n`
          : "";

        const extractPrompt = buildExtractPrompt(extraRules, correctedText);

        const extractResp = await invokeLLM({
          messages: [{ role: "user", content: extractPrompt }],
          response_format: { type: "json_object" } as any,
        });

        let items: ExtractedImportItem[] = [];
        try {
          const extractRaw = extractResp.choices[0].message.content ?? '{}';
          const extractStr = typeof extractRaw === 'string' ? extractRaw : JSON.stringify(extractRaw);
          const parsed = JSON.parse(extractStr.trim().replace(/^```json\n?|```\n?$/g, ""));
          const arr = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.vocabulary ?? parsed.words ?? []);
          items = arr;
        } catch {
          items = [];
        }

        // Compute dateKeys deterministically from each item's raw header,
        // falling back to the LLM guess / today when there's no header.
        items = resolveImportDateKeys(items);

        // Deduplicate
        const seen = new Set<string>();
        const deduped = items.filter((item) => {
          const k = (item.term ?? "").toLowerCase().trim();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        importCache.set(cacheKey, deduped);
        return { items: deduped, corrections };
      }),

    extractFromGoogleDoc: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
          instructions: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Parse the Google Docs document ID from the URL
        const docIdMatch = input.url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
        if (!docIdMatch) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Google Docs URL. Please share a link like: https://docs.google.com/document/d/..." });
        }
        const docId = docIdMatch[1];
        // Use the public export endpoint to get plain text
        const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
        let docText: string;
        try {
          const resp = await fetch(exportUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; FrenchDictBot/1.0)" },
            redirect: "follow",
          });
          if (!resp.ok) {
            if (resp.status === 403 || resp.status === 401) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Cannot access this document. Please make sure it is shared as 'Anyone with the link can view'.",
              });
            }
            throw new TRPCError({ code: "BAD_REQUEST", message: `Failed to fetch document (HTTP ${resp.status}). Make sure the document is publicly shared.` });
          }
          docText = await resp.text();
          if (!docText.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "The document appears to be empty." });
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch the Google Doc. Check the URL and sharing settings." });
        }
        // Reuse the same extraction logic as extractFromText
        const cacheKey = "gdoc:" + docId + (input.instructions ?? "");
        if (importCache.has(cacheKey)) return { items: importCache.get(cacheKey)!, corrections: [], docPreview: docText.slice(0, 300) };
        // Typo correction
        let correctedText = docText;
        let corrections: { original: string; fixed: string; note: string }[] = [];
        try {
          const corrResp = await invokeLLM({
            messages: [{
              role: "user",
              content: `You are a French language proofreader. Correct typos, wrong accents, and clear grammar mistakes in the French text below. Keep structure and non-French parts EXACTLY the same. Return ONLY this JSON:
{"corrected":"full corrected text","corrections":[{"original":"bonjure","fixed":"bonjour","note":"spelling"}]}
Text:
${docText.slice(0, 20000)}`,
            }],
            response_format: { type: "json_object" } as any,
          });
          const corrRaw = corrResp.choices[0].message.content ?? "{}";
          const corrStr = typeof corrRaw === 'string' ? corrRaw : JSON.stringify(corrRaw);
          const parsed = JSON.parse(corrStr);
          if (parsed.corrected) correctedText = parsed.corrected;
          if (Array.isArray(parsed.corrections)) corrections = parsed.corrections;
        } catch { /* non-fatal */ }
        // Extract vocabulary
        const extraRules = input.instructions?.trim() ? `\nAdditional instructions: ${input.instructions.trim()}\n` : "";
        const extractPrompt = buildExtractPrompt(extraRules, correctedText);
        const extractResp = await invokeLLM({
          messages: [{ role: "user", content: extractPrompt }],
          response_format: { type: "json_object" } as any,
        });
        let items: ExtractedImportItem[] = [];
        try {
          const extractRaw = extractResp.choices[0].message.content ?? '{}';
          const extractStr = typeof extractRaw === 'string' ? extractRaw : JSON.stringify(extractRaw);
          const parsed = JSON.parse(extractStr.trim().replace(/^```json\n?|```\n?$/g, ""));
          const arr = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.vocabulary ?? parsed.words ?? []);
          items = arr;
        } catch { items = []; }
        // Deterministic dates from raw headers (LLM guess / today as fallback).
        items = resolveImportDateKeys(items);
        const seen = new Set<string>();
        const deduped = items.filter((item) => {
          const k = (item.term ?? "").toLowerCase().trim();
          if (!k || seen.has(k)) return false;
          seen.add(k); return true;
        });
        importCache.set(cacheKey, deduped);
        return { items: deduped, corrections, docPreview: docText.slice(0, 300) };
      }),
    quickTranslate: protectedProcedure
      .input(z.object({ term: z.string().min(1).max(200) }))
      .mutation(async ({ input }) => {
        const response = await invokeLLM({
          messages: [
            {
              role: "user",
              content: `Translate this French word or phrase to English. Return ONLY JSON: {"translation":"concise English meaning"}\nFrench: "${input.term}"`,
            },
          ],
          response_format: { type: "json_object" } as any,
        });
        const rawC = response.choices[0].message.content ?? '{"translation":""}';
        const rawStr = typeof rawC === 'string' ? rawC : JSON.stringify(rawC);
        const parsed = JSON.parse(rawStr);
        return { translation: parsed.translation ?? "" };
      }),
  }),

  // ─── Tutor ───────────────────────────────────────────────────────────────────
  tutor: router({
    history: protectedProcedure.query(async ({ ctx }) => {
      return getTutorHistory(ctx.user.id, 40);
    }),

    chat: protectedProcedure
      .input(z.object({ message: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        // Save user message
        await saveTutorMessage(ctx.user.id, "user", input.message);

        // Get recent history for context
        const history = await getTutorHistory(ctx.user.id, 20);
        const messages = history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert French language tutor. Help the user learn French through conversation, grammar explanations, sentence building, and vocabulary practice. 
- Always provide French examples WITH proper accents
- Correct mistakes gently and explain why
- Encourage the user
- Keep responses concise but helpful
- When showing French text, also provide the English translation`,
            },
            ...messages,
          ],
        });

        const replyRaw = response.choices[0].message.content ?? "Je suis désolé, je n'ai pas pu répondre.";
        const reply = typeof replyRaw === 'string' ? replyRaw : JSON.stringify(replyRaw);
        await saveTutorMessage(ctx.user.id, "assistant", reply);
        return { reply };
      }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await clearTutorHistory(ctx.user.id);
      return { success: true };
    }),

    // Context-aware chat: user asks about a specific vocab card
    contextChat: protectedProcedure
      .input(
        z.object({
          message: z.string().min(1).max(2000),
          vocabContext: z.object({
            term: z.string(),
            translation: z.string(),
            wordType: z.string().optional(),
            pronunciation: z.string().optional(),
            grammar: z.string().optional(),
            examples: z.array(z.object({ fr: z.string(), en: z.string() })).optional(),
            conjugationInfo: z.string().optional(),
            synonyms: z.array(z.string()).optional(),
            reflexiveInfo: z.string().optional(),
          }).optional(),
        })
      )
      .mutation(async ({ input }) => {
        let systemPrompt = `You are an expert French language tutor. Help the user understand French vocabulary, grammar, and usage.
- Always provide French examples WITH proper accents
- Correct mistakes gently and explain why
- Keep responses concise but helpful
- When showing French text, also provide the English translation`;

        if (input.vocabContext) {
          const ctx = input.vocabContext;
          const examplesText = ctx.examples?.map(e => `  • ${e.fr} — ${e.en}`).join('\n') ?? '';
          systemPrompt += `\n\n## Current vocabulary card in context:
**Term:** ${ctx.term}
**Translation:** ${ctx.translation}${ctx.wordType ? `\n**Type:** ${ctx.wordType}` : ''}${ctx.pronunciation ? `\n**Pronunciation:** [${ctx.pronunciation}]` : ''}${ctx.grammar ? `\n**Grammar note:** ${ctx.grammar}` : ''}${ctx.conjugationInfo ? `\n**Conjugation info:** ${ctx.conjugationInfo}` : ''}${ctx.reflexiveInfo ? `\n**Reflexive info:** ${ctx.reflexiveInfo}` : ''}${examplesText ? `\n**Examples:**\n${examplesText}` : ''}${ctx.synonyms?.length ? `\n**Synonyms:** ${ctx.synonyms.join(', ')}` : ''}

The user is asking about this specific word/phrase. Answer in the context of this vocabulary entry.`;
        }

        const response = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input.message },
          ],
        });

        const replyRaw = response.choices[0].message.content ?? 'Je suis désolé, je n\'ai pas pu répondre.';
        const reply = typeof replyRaw === 'string' ? replyRaw : JSON.stringify(replyRaw);
        return { reply };
      }),
  }),

  // ─── Voice transcription ─────────────────────────────────────────────────────
  // ─── Storage ────────────────────────────────────────────────────────────────
  storage: router({
    uploadAudio: protectedProcedure
      .input(z.object({ base64: z.string(), mimeType: z.string().default("audio/webm") }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1] ?? "webm";
        const key = `audio/${ctx.user.id}-${Date.now()}.${ext}`;
        const result = await storagePut(key, buffer, input.mimeType);
        return result;
      }),
  }),

  voice: router({
    // OpenAI TTS: accepts French text, returns base64-encoded MP3 audio
    tts: protectedProcedure
      .input(z.object({ text: z.string().min(1).max(500) }))
      .mutation(async ({ input }) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'OpenAI not configured' });
        const resp = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            input: input.text,
            voice: 'marin',
            response_format: 'mp3',
            speed: 0.9,
            instructions: 'You are a native French speaker. Pronounce every word with authentic French phonetics and a natural French accent. Never anglicize French words.',
          }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `TTS error: ${err}` });
        }
        const arrayBuffer = await resp.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return { base64, mimeType: 'audio/mpeg' };
      }),

    transcribe: protectedProcedure
      .input(z.object({ audioUrl: z.string().url(), targetTerm: z.string() }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: "fr",
          prompt: `French pronunciation of: ${input.targetTerm}`,
        });
        if ('error' in result) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
        }
        return { transcription: result.text ?? "" };
      }),
    // Returns a signed WebSocket URL for starting a private ElevenLabs Anna session.
    annaSignedUrl: protectedProcedure.mutation(async () => {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      const agentId = process.env.ELEVENLABS_ANNA_AGENT_ID;
      if (!apiKey || !agentId) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'ElevenLabs not configured' });
      }
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
        { headers: { 'xi-api-key': apiKey } }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `ElevenLabs error: ${err}` });
      }
      const data = await res.json() as { signed_url: string };
      return { signedUrl: data.signed_url };
    }),

    // Called by the voice client when Romain invokes the web_search tool.
    // Uses the LLM to answer factual queries and returns a short plain-text
    // snippet that the client sends back to Romain as a function_call_output.
    webSearch: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(500) }))
      .mutation(async ({ input }) => {
        try {
          const resp = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful assistant that answers factual questions concisely. " +
                  "Provide a short, accurate answer (2-4 sentences max). " +
                  "If the question is about very recent events after your knowledge cutoff, say so briefly. " +
                  "Do not use markdown formatting — plain text only, suitable for text-to-speech.",
              },
              { role: "user", content: input.query },
            ],
          });
          const raw = resp.choices[0].message.content ?? "";
          const result = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
          return { result };
        } catch {
          return { result: "Je n'ai pas pu trouver une réponse à cette question." };
        }
      }),
  }),

  // ─── Voice Chat Sessions ─────────────────────────────────────────────────────
  voiceSession: router({
    // Create a new session record and return its ID
    create: protectedProcedure.mutation(async ({ ctx }) => {
      const id = await createVoiceSession(ctx.user.id);
      return { id };
    }),

    // Save a word discovered during voice chat to the vocab library
    saveWord: protectedProcedure
      .input(z.object({
        term: z.string().min(1).max(512),
        translation: z.string().min(1).max(512),
        kind: z.enum(["word", "phrase"]).default("word"),
      }))
      .mutation(async ({ ctx, input }) => {
        const today = todayKey();
        const id = await addVocabEntry(ctx.user.id, {
          term: input.term,
          translation: input.translation,
          entryKind: input.kind,
          dateKey: today,
          lessonSource: "Voice Chat",
        });
        return { id };
      }),

    // End a session: persist transcript + generate summary + extract user memory
    end: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
        transcript: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string(),
          timestamp: z.number(),
        })),
        savedWords: z.array(z.object({
          term: z.string(),
          translation: z.string(),
          kind: z.string(),
        })),
        agentName: z.string().optional(), // "Romain" or "Anna"
      }))
      .mutation(async ({ ctx, input }) => {
        const agentLabel = input.agentName ?? "Romain";
        // Generate a summary using the LLM
        const transcriptText = input.transcript
          .map((m) => `${m.role === "user" ? "Student" : agentLabel}: ${m.text}`)
          .join("\n");
        let summary = "";
        try {
          const summaryResp = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "You are a helpful assistant that summarises French tutoring sessions. Be concise (3-5 sentences). Mention: main topics discussed, any grammar points covered, and words/phrases saved. Write in English.",
              },
              {
                role: "user",
                content: `Summarise this French tutoring session transcript:\n\n${transcriptText.slice(0, 4000)}`,
              },
            ],
          });
          const raw = summaryResp.choices[0].message.content ?? "";
          summary = typeof raw === "string" ? raw : JSON.stringify(raw);
        } catch {
          summary = "Session completed.";
        }

        // Extract and merge user memory (fire-and-forget, don't block session save)
        (async () => {
          try {
            if (input.transcript.length < 4) return; // Skip very short sessions
            const existingMemory = await getUserMemory(ctx.user.id);
            const memoryResp = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content:
                    "You are a memory extractor for a French language learning app. " +
                    "Read the conversation transcript and extract personal facts about the STUDENT only (not the tutor). " +
                    "Focus on: hobbies, interests, pets, family members, recent life events, preferences, job, location, health, sports, travel. " +
                    "Merge with the existing memory note if provided — update changed facts, add new ones, remove outdated ones. " +
                    "Output a compact 3-6 sentence memory note in English, written as facts (e.g. 'The student has a dog named Max who was injured in March 2026. He likes football and supports PSG. He works as an engineer in Montreal.'). " +
                    "If there are no meaningful personal facts in this session, return the existing memory unchanged. " +
                    "If there is no existing memory and no facts, return an empty string.",
                },
                {
                  role: "user",
                  content: [
                    existingMemory ? `Existing memory:\n${existingMemory}\n\n` : "",
                    `New session transcript:\n${transcriptText.slice(0, 5000)}`,
                  ].join(""),
                },
              ],
            });
            const raw = memoryResp.choices[0].message.content ?? "";
            const newMemory = typeof raw === "string" ? raw.trim() : "";
            if (newMemory) {
              await updateUserMemory(ctx.user.id, newMemory);
            }
          } catch (e) {
            console.error("[Memory] Failed to extract user memory:", e);
          }
        })();

        await endVoiceSession(
          input.sessionId,
          JSON.stringify(input.transcript),
          summary,
          JSON.stringify(input.savedWords)
        );
        return { summary };
      }),

    // Get the current user's memory note (for injection at session start)
    getUserMemory: protectedProcedure.query(async ({ ctx }) => {
      const memory = await getUserMemory(ctx.user.id);
      return { memory };
    }),

    // Update the user's memory note directly (from the memory viewer panel)
    updateUserMemory: protectedProcedure
      .input(z.object({ memory: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await updateUserMemory(ctx.user.id, input.memory.trim());
        return { success: true };
      }),

    // Summarize older conversation turns to reduce context window size
    // Called by the client every 10 turns; returns a compact summary string
    // that the client injects as a system message and deletes the old raw turns
    summarizeContext: protectedProcedure
      .input(z.object({
        turns: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          text: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const dialogue = input.turns
          .map((t) => `${t.role === "user" ? "Student" : "Romain"}: ${t.text}`)
          .join("\n");
        try {
          const resp = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a concise French tutoring session summarizer. " +
                  "Compress the provided conversation turns into a compact memory note (2-4 sentences max). " +
                  "Include: topics discussed, vocabulary introduced, grammar points covered, and any errors the student made. " +
                  "Write in English. Be specific but brief — this note will be injected into an ongoing AI context window to save tokens.",
              },
              {
                role: "user",
                content: `Summarize these conversation turns into a compact memory note:\n\n${dialogue}`,
              },
            ],
          });
          const raw = resp.choices[0].message.content ?? "";
          const summary = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
          return { summary };
        } catch {
          // If summarization fails, return a minimal fallback so the client can still prune
          return { summary: `[Earlier conversation: ${input.turns.length} turns covering French practice.]` };
        }
      }),

    // List all past sessions for the user
    list: protectedProcedure.query(async ({ ctx }) => {
      const sessions = await getVoiceSessions(ctx.user.id);
      return sessions.map((s: any) => ({
        ...s,
        transcript: s.transcript ? JSON.parse(s.transcript) : [],
        savedWords: s.savedWords ? JSON.parse(s.savedWords) : [],
      }));
    }),
  }),

  // ─── Progress / Stats ────────────────────────────────────────────
  progress: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const [vocabStats, quizHistory, allWords] = await Promise.all([
        getVocabStats(ctx.user.id),
        getQuizSessions(ctx.user.id),
        getVocabByUser(ctx.user.id),
      ]);

      // Streak calculation
      const days = Array.from(new Set(allWords.map((w) => w.dateKey))).sort().reverse();
      const today = todayKey();
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      let currentStreak = 0;
      if (days.length > 0 && (days[0] === today || days[0] === yesterday)) {
        currentStreak = 1;
        for (let i = 1; i < days.length; i++) {
          const prev = new Date(days[i - 1] + "T12:00:00");
          const curr = new Date(days[i] + "T12:00:00");
          if (prev.getTime() - curr.getTime() <= 86400000 + 1000) currentStreak++;
          else break;
        }
      }
      let longestStreak = 1, run = 1;
      const asc = [...days].sort();
      for (let i = 1; i < asc.length; i++) {
        const prev = new Date(asc[i - 1] + "T12:00:00");
        const curr = new Date(asc[i] + "T12:00:00");
        if (curr.getTime() - prev.getTime() <= 86400000 + 1000) { run++; longestStreak = Math.max(longestStreak, run); }
        else run = 1;
      }
      longestStreak = Math.max(longestStreak, currentStreak);

      // Due for review count
      const dueCount = allWords.filter((w) => {
        if (w.starred) return true;
        const seen = w.quizCount ?? 0;
        if (seen === 0) return true;
        const lastQ = w.lastQuizzed ? new Date(w.lastQuizzed) : new Date(0);
        const daysSince = (Date.now() - lastQ.getTime()) / 86400000;
        if (seen === 1) return daysSince >= 1;
        return daysSince >= 3;
      }).length;

      return {
        totalWords: vocabStats.total,
        todayWords: vocabStats.today,
        byDay: vocabStats.byDay,
        currentStreak,
        longestStreak,
        totalDays: days.length,
        dueCount,
        recentQuizzes: quizHistory.slice(0, 5),
      };
    }),
  }),

  // ─── SM-2 Spaced Repetition ───────────────────────────────────────────────
  review: router({
    /** Get words due today (new + overdue review, interleaved) */
    getDueToday: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getReviewSettings(ctx.user.id);
      const words = await getDueVocab(ctx.user.id, settings.dailyNewWords, settings.dailyReviewCap);
      return words;
    }),

    /** Unified launch-screen queue: due-today or all-words, optional date, optional size */
    getQueue: protectedProcedure
      .input(z.object({
        mode: z.enum(["due", "all"]),
        dateKey: z.string().max(100).optional(),
        limit: z.number().min(1).max(500).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return getReviewQueue(ctx.user.id, input);
      }),

    /** Date groups with total + due counts, for the launch-screen dropdown */
    getDates: protectedProcedure.query(async ({ ctx }) => {
      return getReviewDates(ctx.user.id);
    }),

    /** Submit a SM-2 grade (1-5) for a vocab word — used by flashcard self-rating */
    submitReview: protectedProcedure
      .input(z.object({ vocabId: z.number(), grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]) }))
      .mutation(async ({ ctx, input }) => {
        await submitSm2Review(ctx.user.id, input.vocabId, input.grade);
        return { ok: true };
      }),

    /** Record a quiz answer; the server auto-prioritizes (no self-grade) */
    submitQuizResult: protectedProcedure
      .input(z.object({ vocabId: z.number(), correct: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        await submitQuizResult(ctx.user.id, input.vocabId, input.correct);
        return { ok: true };
      }),

    /** Get SM-2 status counts (new/learning/review/mastered/dueToday) */
    getStats: protectedProcedure.query(async ({ ctx }) => {
      return getSm2Stats(ctx.user.id);
    }),

    /** Get review settings */
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      return getReviewSettings(ctx.user.id);
    }),

    /** Update review settings */
    updateSettings: protectedProcedure
      .input(z.object({
        dailyNewWords: z.number().min(1).max(50).optional(),
        dailyReviewCap: z.number().min(1).max(100).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateReviewSettings(ctx.user.id, input);
        return { ok: true };
      }),
  }),

  // ─── Google Drive ────────────────────────────────────────────────────────────
  google: router({
    /** Returns the connected Google account info (or null if not connected) */
    status: protectedProcedure.query(async ({ ctx }) => {
      const account = await getGoogleAccountByUserId(ctx.user.id);
      const settings = await getGoogleDriveSettings(ctx.user.id);
      const pendingCount = await countPendingImports(ctx.user.id);
      if (!account) return { connected: false, pendingCount };
      return {
        connected: true,
        email: account.email,
        name: account.name,
        picture: account.picture,
        sourceDocUrl: settings?.sourceDocUrl ?? null,
        exportDocId: settings?.exportFolderId ?? null,
        lastSyncedAt: settings?.lastSyncedAt ?? null,
        pendingCount,
      };
    }),

    /** Disconnect Google account */
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await deleteGoogleAccount(ctx.user.id);
      return { ok: true };
    }),

    /** Save Drive sync settings (source doc URL, extraction model) */
    saveSettings: protectedProcedure
      .input(z.object({
        sourceDocUrl: z.string().url().nullable().optional(),
        extractionModel: z.enum(["deepseek-v4-flash", "gemini-2.5-flash"]).optional(),
        autoSyncFrequency: z.enum(["off", "daily", "weekly"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const update: Record<string, unknown> = {};
        if (input.sourceDocUrl !== undefined) update.sourceDocUrl = input.sourceDocUrl ?? null;
        if (input.extractionModel !== undefined) update.extractionModel = input.extractionModel;
        if (input.autoSyncFrequency !== undefined) update.autoSyncFrequency = input.autoSyncFrequency;
        await upsertGoogleDriveSettings(ctx.user.id, update);
        return { ok: true };
      }),

    /** Get current Drive settings including extractionModel */
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getGoogleDriveSettings(ctx.user.id);
      return {
        sourceDocUrl: settings?.sourceDocUrl ?? null,
        extractionModel: (settings?.extractionModel ?? "deepseek-v4-flash") as "deepseek-v4-flash" | "gemini-2.5-flash",
        autoSyncFrequency: (settings?.autoSyncFrequency ?? "off") as "off" | "daily" | "weekly",
        lastSyncedAt: settings?.lastSyncedAt ?? null,
      };
    }),

    /** Fetch the linked Google Doc and queue new words for review */
    syncNow: protectedProcedure.mutation(async ({ ctx }) => {
      const settings = await getGoogleDriveSettings(ctx.user.id);
      if (!settings?.sourceDocUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No source document URL configured" });
      }

      const docId = extractDocId(settings.sourceDocUrl);
      if (!docId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Google Doc URL" });
      }

      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(ctx.user.id);
      } catch (e: any) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: e.message ?? "Google account not connected" });
      }

      const { text: docText, revisionId, lines: docLines } = await fetchGoogleDocText(docId, accessToken);

      // Get existing terms for deduplication
      const existingVocab = await getVocabByUser(ctx.user.id);
      const normalize = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const existingTerms = new Set(existingVocab.map((v) => normalize(v.term)));

      // Also exclude already-pending imports
      const pending = await getPendingImports(ctx.user.id);
      for (const p of pending) existingTerms.add(normalize(p.term));

      const extracted = await extractVocabFromText(docText, existingTerms, undefined, docLines);

      if (extracted.length > 0) {
        const dateKey = new Date().toISOString().split("T")[0];
        await insertPendingImports(
          ctx.user.id,
          extracted.map((e) => ({ ...e, dateKey }))
        );
      }

      await upsertGoogleDriveSettings(ctx.user.id, {
        lastSyncedAt: Date.now(),
        ...(revisionId ? { lastRevisionId: revisionId } : {}),
      });

      return { found: extracted.length };
    }),

    /** Get pending imports for review */
    getPendingImports: protectedProcedure.query(async ({ ctx }) => {
      return getPendingImports(ctx.user.id);
    }),

    /** Accept a pending import — moves it to the vocab library */
    acceptImport: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Look up by ID directly (not through the pending-only list) so that
        // items already marked 'accepted' by a group-accept can still be
        // individually accepted without throwing NOT_FOUND.
        const item = await getPendingImportById(input.id, ctx.user.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        // Only add to vocab library if not already accepted
        if (item.status !== "accepted") {
          await addVocabEntry(ctx.user.id, {
            term: item.term,
            translation: item.translation,
            entryKind: item.kind,
            dateKey: item.dateKey,
          });
          await updatePendingImportStatus(input.id, ctx.user.id, "accepted");
        }
        return { ok: true };
      }),

    /** Accept all pending imports at once */
    acceptAllImports: protectedProcedure.mutation(async ({ ctx }) => {
      const pending = await getPendingImports(ctx.user.id);
      if (pending.length === 0) return { added: 0 };
      const dateKey = new Date().toISOString().split("T")[0];
      await addVocabEntries(
        ctx.user.id,
        pending.map((p) => ({
          term: p.term,
          translation: p.translation,
          entryKind: p.kind,
          dateKey: p.dateKey || dateKey,
        }))
      );
      for (const p of pending) {
        await updatePendingImportStatus(p.id, ctx.user.id, "accepted");
      }
      return { added: pending.length };
    }),

    /** Skip a pending import */
    skipImport: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await updatePendingImportStatus(input.id, ctx.user.id, "skipped");
        return { ok: true };
      }),

    /** Accept all pending imports in a date group */
    acceptGroup: protectedProcedure
      .input(z.object({ dateKey: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const items = await bulkUpdatePendingImportsByDateKey(ctx.user.id, input.dateKey, "accepted");
        if (items.length === 0) return { added: 0 };
        await addVocabEntries(
          ctx.user.id,
          items.map((p) => ({
            term: p.term,
            translation: p.translation,
            entryKind: p.kind,
            dateKey: p.dateKey || new Date().toISOString().split("T")[0],
            groupLabel: p.groupLabel ?? null,
          }))
        );
        return { added: items.length };
      }),

    /** Skip all pending imports in a date group */
    skipGroup: protectedProcedure
      .input(z.object({ dateKey: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const items = await bulkUpdatePendingImportsByDateKey(ctx.user.id, input.dateKey, "skipped");
        return { skipped: items.length };
      }),

    /** Export the user's full vocab library to a Google Doc */
    exportLibrary: protectedProcedure.mutation(async ({ ctx }) => {
      let accessToken: string;
      try {
        accessToken = await getValidAccessToken(ctx.user.id);
      } catch (e: any) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: e.message ?? "Google account not connected" });
      }

      const vocab = await getVocabByUser(ctx.user.id);
      const settings = await getGoogleDriveSettings(ctx.user.id);

      const docId = await exportLibraryToGoogleDoc(
        accessToken,
        vocab,
        settings?.exportFolderId ?? null
      );

      // Save the doc ID so future exports update the same doc
      await upsertGoogleDriveSettings(ctx.user.id, { exportFolderId: docId });

      return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
    }),
  }),
});

export type AppRouter = typeof appRouter;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function detectInputType(input: string): "question" | "phrase" | "word" {
  const lower = input.toLowerCase().trim();
  if (
    lower.includes("how do") ||
    lower.includes("how to") ||
    lower.includes("what is") ||
    lower.startsWith("how") ||
    lower.startsWith("what") ||
    lower.endsWith("?")
  )
    return "question";
  if (input.trim().split(/\s+/).length > 1) return "phrase";
  return "word";
}
