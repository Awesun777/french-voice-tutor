/**
 * TCF mock exams (admin-only): exam listing, per-item media and an AI
 * explanation per item.
 *
 * Two sources share one item shape on the wire:
 *  - `romaintalk-<k>`: Romaintalk's own items (shared/tcfMockExams.ts).
 *    Listening audio is synthesised per speaker turn (distinct voices) through
 *    tts_cache, so an item's audio is paid for once ever.
 *  - `tv5-<series>`: TV5MONDE / FEI training booklets ingested into MySQL by
 *    scripts/tcf_tv5_ingest.py (one listening clip + Whisper transcript per
 *    oral item, the reading document as a photo). Admin-only, unmonetised.
 */
import { and, asc, eq } from "drizzle-orm";
import { tcfTv5Items, tcfTv5Series } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { FRENCH_VOICES, synthesizeFrench } from "./tts";
import {
  TCF_MOCK_EXAMS,
  TCF_SECTION_META,
  TCF_SPOKEN_CHOICES_CONSIGNE,
  consigneFor,
  getTcfMockItem,
  transcriptOf,
  type TcfAudioSegment,
  type TcfLetter,
  type TcfMockItem,
  type TcfSection,
  type TcfSpeaker,
} from "@shared/tcfMockExams";

// ── wire shapes ──────────────────────────────────────────────────────────────

export interface TcfExamSummary {
  id: string;
  title: string;
  source: "romaintalk" | "tv5";
  itemCount: number;
}

export interface TcfItemView {
  n: number;
  section: TcfSection;
  level: string | null;
  consigne: string;
  question: string | null;
  /** Reading passage as text (Romaintalk items). */
  passage: string | null;
  choices: string[];
  spokenChoices: boolean;
  answer: TcfLetter;
  /** Author's key point (Romaintalk items only). */
  note: string | null;
  /** Speaker turns (Romaintalk listening items) — drives per-turn highlighting. */
  audio: TcfAudioSegment[] | null;
  /** Plain transcript (TV5 listening items, from Whisper). */
  transcript: string | null;
  hasAudio: boolean;
  hasImage: boolean;
}

export interface TcfMediaView {
  turns?: { speaker: TcfSpeaker; text: string; base64: string; mimeType: string }[];
  clip?: { base64: string; mimeType: string; seconds: number | null };
  image?: { base64: string; mimeType: string } | null;
}

// ── exam ids ─────────────────────────────────────────────────────────────────

export function parseExamId(id: string): { source: "romaintalk"; key: string } | { source: "tv5"; series: number } | null {
  if (id in TCF_MOCK_EXAMS) return { source: "romaintalk", key: id };
  const m = /^tv5-(\d{1,3})$/.exec(id);
  if (m) return { source: "tv5", series: Number(m[1]) };
  return null;
}

export async function listTcfExams(): Promise<TcfExamSummary[]> {
  const out: TcfExamSummary[] = Object.values(TCF_MOCK_EXAMS).map(e => ({
    id: e.id,
    title: e.title,
    source: "romaintalk" as const,
    itemCount: e.items.length,
  }));
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(tcfTv5Series).orderBy(asc(tcfTv5Series.series));
      for (const r of rows) out.push({ id: `tv5-${r.series}`, title: r.title, source: "tv5", itemCount: r.itemCount });
    } catch (e) {
      // Table not created yet → only the Romaintalk series is listed.
      console.warn("[TCF] tv5 series unavailable:", String(e).slice(0, 120));
    }
  }
  return out;
}

// ── item views ───────────────────────────────────────────────────────────────

function viewOfMock(item: TcfMockItem): TcfItemView {
  return {
    n: item.n,
    section: item.section,
    level: item.level,
    consigne: consigneFor(item),
    question: item.question ?? null,
    passage: item.passage ?? null,
    choices: [...item.choices],
    spokenChoices: !!item.spokenChoices,
    answer: item.answer,
    note: item.note,
    audio: item.audio ?? null,
    transcript: item.audio ? transcriptOf(item) : null,
    hasAudio: !!item.audio,
    hasImage: false,
  };
}

/** The light (blob-free) projection of a tv5 row, plus presence flags. */
interface Tv5Light {
  n: number;
  section: string;
  consigne: string | null;
  question: string | null;
  choicesJson: string;
  spokenChoices: number;
  answer: string;
  docText: string | null;
  transcript: string | null;
  hasAudio: boolean;
  hasImage: boolean;
}

function tv5Consigne(row: Tv5Light, section: TcfSection, spoken: boolean): string {
  // The booklet prints "Validé par CIE" under every item; the ingest used to
  // mistake it for an instruction. Never show it as a consigne.
  const own = (row.consigne ?? "").trim();
  if (own && !/CIE\b/.test(own)) return own;
  if (spoken) return TCF_SPOKEN_CHOICES_CONSIGNE;
  return TCF_SECTION_META[section].consigne;
}

function parseChoices(json: string): string[] {
  let choices: string[] = [];
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) choices = v.map(x => String(x ?? ""));
  } catch {
    choices = [];
  }
  while (choices.length < 4) choices.push("");
  return choices.slice(0, 4);
}

/** For spoken-choice items, recover "A. …" … "D. …" from the transcript so
 *  the texts can be shown once the answer is checked. */
function choicesFromTranscript(transcript: string | null): string[] | null {
  if (!transcript) return null;
  const out: string[] = [];
  for (const letter of ["A", "B", "C", "D"]) {
    const m = new RegExp(`(?:^|\\n)${letter}\\.\\s*([^\\n]+)`).exec(transcript);
    if (!m) return null;
    out.push(m[1].trim());
  }
  return out;
}

function viewOfTv5(row: Tv5Light): TcfItemView {
  const section = (["oral", "structure", "ecrit"].includes(row.section) ? row.section : "oral") as TcfSection;
  let choices = parseChoices(row.choicesJson);
  const spoken = row.spokenChoices === 1 || choices.every(c => !c.trim());
  if (spoken) choices = choicesFromTranscript(row.transcript) ?? choices;
  return {
    n: row.n,
    section,
    level: null,
    consigne: tv5Consigne(row, section, spoken),
    question: row.question,
    passage: null,
    choices,
    spokenChoices: spoken,
    answer: (["A", "B", "C", "D"].includes(row.answer) ? row.answer : "A") as TcfLetter,
    note: null,
    audio: null,
    transcript: row.transcript,
    hasAudio: row.hasAudio,
    hasImage: row.hasImage,
  };
}

/** Item rows without the base64 blobs (an exam is 40 rows; blobs are MBs). */
async function tv5Rows(series: number): Promise<Tv5Light[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({
      n: tcfTv5Items.n,
      section: tcfTv5Items.section,
      consigne: tcfTv5Items.consigne,
      question: tcfTv5Items.question,
      choicesJson: tcfTv5Items.choicesJson,
      spokenChoices: tcfTv5Items.spokenChoices,
      answer: tcfTv5Items.answer,
      docText: tcfTv5Items.docText,
      transcript: tcfTv5Items.transcript,
      // mime columns are only set alongside bytes, so they double as presence flags
      audioMime: tcfTv5Items.audioMime,
      imageMime: tcfTv5Items.imageMime,
    })
    .from(tcfTv5Items)
    .where(eq(tcfTv5Items.series, series))
    .orderBy(asc(tcfTv5Items.n));
  return rows.map(r => ({ ...r, hasAudio: !!r.audioMime, hasImage: !!r.imageMime }));
}

export async function loadTcfExam(id: string): Promise<{ summary: TcfExamSummary; items: TcfItemView[] } | null> {
  const parsed = parseExamId(id);
  if (!parsed) return null;
  if (parsed.source === "romaintalk") {
    const exam = TCF_MOCK_EXAMS[parsed.key];
    return {
      summary: { id: exam.id, title: exam.title, source: "romaintalk", itemCount: exam.items.length },
      items: exam.items.map(viewOfMock),
    };
  }
  const rows = await tv5Rows(parsed.series);
  if (rows.length === 0) return null;
  const db = await getDb();
  const meta = db ? (await db.select().from(tcfTv5Series).where(eq(tcfTv5Series.series, parsed.series)))[0] : undefined;
  const items = rows.map(viewOfTv5);
  return {
    summary: { id, title: meta?.title ?? `TV5MONDE — Entraînement n°${parsed.series}`, source: "tv5", itemCount: items.length },
    items,
  };
}

// ── media ────────────────────────────────────────────────────────────────────

const VOICE_FOR: Record<TcfSpeaker, { voiceId: string; openaiVoice: string }> = {
  narratrice: { voiceId: FRENCH_VOICES.sarah, openaiVoice: "sage" },
  femme: { voiceId: FRENCH_VOICES.anna, openaiVoice: "marin" },
  homme: { voiceId: FRENCH_VOICES.maxime, openaiVoice: "onyx" },
  femme2: { voiceId: FRENCH_VOICES.matilda, openaiVoice: "coral" },
  homme2: { voiceId: FRENCH_VOICES.marco, openaiVoice: "echo" },
};

export async function tcfItemMedia(examId: string, n: number): Promise<TcfMediaView | null> {
  const parsed = parseExamId(examId);
  if (!parsed) return null;
  if (parsed.source === "romaintalk") {
    const item = getTcfMockItem(parsed.key, n);
    if (!item) return null;
    if (!item.audio) return {};
    // Sequential on purpose: ElevenLabs concurrency limits are shared with
    // the live voice agents, and a cache-warm item costs nothing anyway.
    const turns: NonNullable<TcfMediaView["turns"]> = [];
    for (const seg of item.audio) {
      const { base64, mimeType } = await synthesizeFrench(seg.text, VOICE_FOR[seg.speaker]);
      turns.push({ speaker: seg.speaker, text: seg.text, base64, mimeType });
    }
    return { turns };
  }
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select({
      audioB64: tcfTv5Items.audioB64,
      audioMime: tcfTv5Items.audioMime,
      audioSeconds: tcfTv5Items.audioSeconds,
      imageB64: tcfTv5Items.imageB64,
      imageMime: tcfTv5Items.imageMime,
    })
    .from(tcfTv5Items)
    .where(and(eq(tcfTv5Items.series, parsed.series), eq(tcfTv5Items.n, n)));
  const r = rows[0];
  if (!r) return null;
  return {
    clip: r.audioB64 ? { base64: r.audioB64, mimeType: r.audioMime ?? "audio/mpeg", seconds: r.audioSeconds ?? null } : undefined,
    image: r.imageB64 ? { base64: r.imageB64, mimeType: r.imageMime ?? "image/jpeg" } : null,
  };
}

// ── explanation ──────────────────────────────────────────────────────────────

export function explanationCacheKey(examId: string, n: number): string {
  return `tcf::v2::${examId}::${n}`;
}

interface ExplainSource {
  section: TcfSection;
  level: string | null;
  transcript: string | null;
  passage: string | null;
  docText: string | null;
  question: string | null;
  choices: string[];
  answer: string;
  note: string | null;
}

async function explainSource(examId: string, n: number): Promise<ExplainSource | null> {
  const parsed = parseExamId(examId);
  if (!parsed) return null;
  if (parsed.source === "romaintalk") {
    const item = getTcfMockItem(parsed.key, n);
    if (!item) return null;
    return {
      section: item.section,
      level: item.level,
      transcript: item.audio ? transcriptOf(item) : null,
      passage: item.passage ?? null,
      docText: null,
      question: item.question ?? null,
      choices: [...item.choices],
      answer: item.answer,
      note: item.note,
    };
  }
  const r = (await tv5Rows(parsed.series)).find(x => x.n === n);
  if (!r) return null;
  const v = viewOfTv5(r);
  return {
    section: v.section,
    level: null,
    transcript: r.transcript,
    passage: null,
    docText: r.docText,
    question: r.question,
    choices: v.choices,
    answer: v.answer,
    note: null,
  };
}

function describeSource(s: ExplainSource): string {
  const lines: string[] = [];
  lines.push(`Section : ${TCF_SECTION_META[s.section].label}${s.level ? ` (niveau visé ${s.level})` : ""}`);
  if (s.transcript) lines.push(`Transcription du document audio (générée automatiquement, peut contenir de petites erreurs) :\n${s.transcript}`);
  if (s.passage) lines.push(`Document écrit :\n${s.passage}`);
  if (s.docText) lines.push(`Texte du document (lu sur l'image) :\n${s.docText}`);
  if (s.question) lines.push(`Question / phrase : ${s.question}`);
  const spoken = s.choices.every(c => !c.trim());
  lines.push(
    spoken
      ? "Propositions : A, B, C, D sont dites à l'oral (voir la transcription)."
      : "Propositions :\n" + s.choices.map((c, i) => `${"ABCD"[i]}. ${c}`).join("\n")
  );
  lines.push(`Bonne réponse : ${s.answer}`);
  if (s.note) lines.push(`Point clé (rédigé par l'auteur) : ${s.note}`);
  return lines.join("\n\n");
}

export async function explainTcfItem(examId: string, n: number): Promise<string> {
  const src = await explainSource(examId, n);
  if (!src) throw new Error("Unknown TCF item");

  const retenir =
    src.section === "structure"
      ? "(3) **À retenir** — la règle de grammaire en une ou deux phrases, puis un deuxième exemple de phrase qui l'applique."
      : "(3) **À retenir** — 2 à 4 mots ou expressions utiles du document, chacun avec une courte glose en anglais entre parenthèses.";
  const resp = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Tu es un professeur de FLE qui prépare des candidats au TCF. " +
          "Explique un item de test à un apprenant anglophone de niveau intermédiaire. " +
          "Réponds en français simple et clair, en Markdown, sans titre de niveau 1, et sans ajouter d'autre section que les trois demandées. " +
          "Structure : (1) **Pourquoi la bonne réponse est la bonne** — cite le passage ou la réplique qui la justifie ; " +
          "(2) **Pourquoi les autres sont fausses** — une ligne par distracteur, en nommant le piège (mot répété, contresens, hors sujet…) ; " +
          retenir +
          " Reste concis : 150 à 250 mots.",
      },
      { role: "user", content: describeSource(src) },
    ],
    maxTokens: 900,
  });
  const raw = resp.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new Error("Empty explanation");
  return text;
}

// ─── Transcript glossing ──────────────────────────────────────────────────────
// Same idea as the Listening Lab: every word of the transcript is a hoverable
// span with a lemma and a short English gloss, and multi-word expressions are
// one span. Generated once per item (the router caches it in dict_cache).

export interface TcfGlossToken {
  s: number;
  e: number;
  surface: string;
  lemma?: string;
  gloss: string;
  kind: "word" | "expression";
}
export interface TcfGlossLine {
  text: string;
  tokens: TcfGlossToken[];
}

const WORD_RE = /[A-Za-zÀ-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÿŒœÆæ]+)*/g;
const LETTER_RE = /[A-Za-zÀ-ÿŒœÆæ]/;
/** Closed-class words the model tends to leave out of its list. */
const CLOSED: Record<string, { lemma: string; gloss: string }> = {
  a: { lemma: "avoir", gloss: "has" }, à: { lemma: "à", gloss: "to / at" }, de: { lemma: "de", gloss: "of / from" }, du: { lemma: "de", gloss: "of the" },
  des: { lemma: "de", gloss: "some / of the" }, le: { lemma: "le", gloss: "the" }, la: { lemma: "le", gloss: "the" }, les: { lemma: "le", gloss: "the" },
  un: { lemma: "un", gloss: "a" }, une: { lemma: "un", gloss: "a" }, et: { lemma: "et", gloss: "and" }, ou: { lemma: "ou", gloss: "or" },
  en: { lemma: "en", gloss: "in / of it" }, y: { lemma: "y", gloss: "there" }, ne: { lemma: "ne", gloss: "not (with pas)" }, pas: { lemma: "pas", gloss: "not" },
  que: { lemma: "que", gloss: "that / what" }, qui: { lemma: "qui", gloss: "who / which" }, se: { lemma: "se", gloss: "oneself" }, ce: { lemma: "ce", gloss: "this" },
  est: { lemma: "être", gloss: "is" }, sont: { lemma: "être", gloss: "are" }, ont: { lemma: "avoir", gloss: "have" }, il: { lemma: "il", gloss: "he / it" },
  elle: { lemma: "elle", gloss: "she" }, on: { lemma: "on", gloss: "we / one" }, je: { lemma: "je", gloss: "I" }, tu: { lemma: "tu", gloss: "you" },
  vous: { lemma: "vous", gloss: "you" }, nous: { lemma: "nous", gloss: "we" }, dans: { lemma: "dans", gloss: "in" }, sur: { lemma: "sur", gloss: "on / about" },
  pour: { lemma: "pour", gloss: "for" }, avec: { lemma: "avec", gloss: "with" }, mais: { lemma: "mais", gloss: "but" }, au: { lemma: "à", gloss: "to the" },
  aux: { lemma: "à", gloss: "to the" }, plus: { lemma: "plus", gloss: "more" }, très: { lemma: "très", gloss: "very" }, si: { lemma: "si", gloss: "if / so" },
};

const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    glosses: {
      type: "array",
      items: {
        type: "object",
        properties: { surface: { type: "string" }, lemma: { type: "string" }, gloss: { type: "string" } },
        required: ["surface", "lemma", "gloss"],
        additionalProperties: false,
      },
    },
    contextual: {
      type: "array",
      items: {
        type: "object",
        properties: { line: { type: "integer" }, surface: { type: "string" }, lemma: { type: "string" }, gloss: { type: "string" } },
        required: ["line", "surface", "lemma", "gloss"],
        additionalProperties: false,
      },
    },
    expressions: {
      type: "array",
      items: {
        type: "object",
        properties: { phrase: { type: "string" }, gloss: { type: "string" } },
        required: ["phrase", "gloss"],
        additionalProperties: false,
      },
    },
  },
  required: ["glosses", "contextual", "expressions"],
  additionalProperties: false,
};

export function glossCacheKey(examId: string, n: number): string {
  return `tcf::gloss::v1::${examId}::${n}`;
}

/** The transcript as plain lines (speaker labels stripped for the model). */
export function tcfTranscriptLines(item: TcfItemView): string[] {
  if (item.audio) return item.audio.map(seg => seg.text.trim()).filter(Boolean);
  return (item.transcript ?? "")
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function layTokens(
  text: string,
  glossBy: Map<string, { lemma: string; gloss: string }>,
  contextualBy: Map<string, { lemma: string; gloss: string }>,
  expressions: { phrase: string; gloss: string }[]
): TcfGlossToken[] {
  const claimed: TcfGlossToken[] = [];
  const overlaps = (s: number, e: number) => claimed.some(t => s < t.e && e > t.s);
  const lower = text.toLowerCase();
  for (const { phrase, gloss } of [...expressions].sort((a, b) => b.phrase.length - a.phrase.length)) {
    const needle = phrase.toLowerCase().trim();
    if (needle.length < 3) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      const before = at === 0 || !LETTER_RE.test(text[at - 1]);
      const after = end === text.length || !LETTER_RE.test(text[end]);
      if (before && after && !overlaps(at, end)) claimed.push({ s: at, e: end, surface: text.slice(at, end), gloss, kind: "expression" });
      from = at + needle.length;
    }
  }
  for (const m of Array.from(text.matchAll(WORD_RE))) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (overlaps(s, e)) continue;
    const key = m[0].toLowerCase();
    const known = glossBy.get(key);
    const g = contextualBy.get(key) ?? (known?.gloss ? known : undefined) ?? CLOSED[key] ?? known;
    claimed.push({ s, e, surface: m[0], lemma: g?.lemma, gloss: g?.gloss ?? "", kind: "word" });
  }
  return claimed.sort((a, b) => a.s - b.s);
}

export async function glossTcfTranscript(examId: string, n: number): Promise<TcfGlossLine[]> {
  const exam = await loadTcfExam(examId);
  const item = exam?.items.find(it => it.n === n);
  if (!item) throw new Error("Unknown TCF item");
  const lines = tcfTranscriptLines(item);
  if (lines.length === 0) return [];

  const numbered = lines.map((t, i) => `[${i + 1}] ${t.replace(/\s+/g, " ")}`).join("\n");
  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You help English speakers understand spoken French. Return only valid JSON matching the schema exactly." },
      {
        role: "user",
        content:
          `French listening-test transcript, one numbered line per turn:\n"""\n${numbered}\n"""\n\n` +
          `1) "glosses": for every distinct French word above, give its dictionary form ("lemma") and a concise English meaning as used here ("gloss", 1-5 words). Copy "surface" exactly as it appears, accents preserved.\n` +
          `2) "contextual": when a surface form's lemma or meaning differs between lines (e.g. "suis" = être vs suivre), add one entry per occurrence with "line" = the bracketed line number (1-${lines.length}). Empty if nothing is ambiguous.\n` +
          `3) "expressions": multi-word expressions of 2-5 words appearing VERBATIM above that a learner should memorise as ONE unit — greetings and set questions, fixed phrases ("s'il vous plaît", "bien sûr"), discourse markers ("en fait", "du coup"), grammatical chunks ("il y a", "est-ce que", "il faut"), verbs with their fixed preposition ("avoir besoin de"). Exclude ordinary clauses. Copy each phrase exactly, accents and elisions preserved.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: { name: "tcf_transcript_glosses", strict: true, schema: GLOSS_SCHEMA } } as never,
  });
  const raw = response.choices[0].message.content ?? "{}";
  let parsed: { glosses?: { surface: string; lemma: string; gloss: string }[]; contextual?: { line: number; surface: string; lemma: string; gloss: string }[]; expressions?: { phrase: string; gloss: string }[] } = {};
  try {
    parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
  } catch {
    parsed = {};
  }
  const glossBy = new Map<string, { lemma: string; gloss: string }>();
  for (const g of parsed.glosses ?? []) if (g.surface) glossBy.set(g.surface.toLowerCase(), { lemma: g.lemma, gloss: g.gloss });
  const contextualByLine = new Map<number, Map<string, { lemma: string; gloss: string }>>();
  for (const c of parsed.contextual ?? []) {
    if (!c.surface || !Number.isInteger(c.line)) continue;
    const m = contextualByLine.get(c.line) ?? new Map();
    m.set(c.surface.toLowerCase(), { lemma: c.lemma, gloss: c.gloss });
    contextualByLine.set(c.line, m);
  }
  return lines.map((text, i) => ({ text, tokens: layTokens(text, glossBy, contextualByLine.get(i + 1) ?? new Map(), parsed.expressions ?? []) }));
}
