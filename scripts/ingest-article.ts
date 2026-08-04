/**
 * ingest-article.ts — curate a French article into a glossed reading lesson.
 *
 *   railway run -- pnpm tsx scripts/ingest-article.ts <url> [--level B1]
 *   railway run -- pnpm tsx scripts/ingest-article.ts --file piece.txt \
 *                    --title "…" --source "Le Monde"
 *
 * Deliberately separate from ingest-video.ts. Reading and the Listening Lab are
 * independent sections, and this pipeline has no audio, no Whisper and no
 * timings — it only fetches text and glosses it.
 *
 * Runs locally and ahead of time so the app never calls an LLM at request time:
 * it only reads pre-computed rows, which is what makes hovering instant and
 * keeps the cost at one pass per article rather than one per reader.
 *
 * Requires DATABASE_URL + OPENAI_API_KEY (which `railway run` supplies).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

import { getDb } from "../server/db";
import { invokeLLM } from "../server/_core/llm";
import { articles, articleBlocks, dictCache } from "../drizzle/schema";
import {
  ambiguousNote,
  CONTEXTUAL_SCHEMA,
  bucketContextual,
  decisiveGloss,
  type ContextualGloss,
} from "./homographs";
import {
  BREAKDOWN_SCHEMA,
  breakdownInstruction,
  renderBatch,
  validateParts,
  wordsOf,
  breakdownInChunks,
  isShortEnoughToGroup,
  type BreakdownPart,
  type BreakdownPayload,
} from "./breakdown";

/** Roughly one gloss request per this many characters of article text. */
const CHARS_PER_GLOSS_BATCH = 2500;
/** Matches the batch concurrency used elsewhere in the repo. */
const GLOSS_CONCURRENCY = 3;
/** Default cap so one enormous piece can't run up a surprising bill. */
const DEFAULT_MAX_WORDS = 1200;
/** How much stripped page text to hand the extractor. */
const MAX_EXTRACT_CHARS = 24000;

/**
 * French-aware word matcher: letters plus internal apostrophes and hyphens.
 * Œ/œ and Æ/æ are named explicitly — they sit in Latin Extended-A, outside the
 * À-ÿ range, so without them "sœur" tokenises as "s" + "ur".
 */
const WORD_RE = /[A-Za-zÀ-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÿŒœÆæ]+)*/g;

interface Token {
  s: number;
  e: number;
  surface: string;
  lemma?: string;
  gloss: string;
  kind: "word" | "expression";
}
interface Block {
  idx: number;
  kind: "heading" | "paragraph";
  text: string;
  tokens: Token[];
  /** English for the whole block, from the sentence breakdown. */
  translationEn?: string;
}

// ─── Fetching and stripping ───────────────────────────────────────────────────

/** A real UA: plenty of publishers serve a stub or a 403 to obvious scripts. */
/**
 * Refuse anything shorter than this. One rule covers two failure modes that
 * both return a healthy 200: a paywall teaser, and a video or show page whose
 * only text is the blurb under the player. Three France 24 "Info éco" segments
 * came in at 162-240 words and sat in the feed looking like real reads.
 */
const DEFAULT_MIN_WORDS = 350;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  hellip: "…", mdash: "—", ndash: "–", eacute: "é", egrave: "è", ecirc: "ê",
  agrave: "à", acirc: "â", ccedil: "ç", ugrave: "ù", ucirc: "û", icirc: "î",
  iuml: "ï", ocirc: "ô", euml: "ë", uuml: "ü", deg: "°", euro: "€",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** Pull a <meta> value by property or name, whichever the page used. */
function meta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return null;
}

/**
 * Strip a page down to readable text.
 *
 * There is no cheerio or jsdom in this project, and adding a DOM parser for one
 * script isn't worth it — the LLM extractor downstream is what actually
 * separates article body from navigation noise, so this only has to be roughly
 * right: kill the non-content elements, keep paragraph boundaries.
 */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

// ─── Extraction ───────────────────────────────────────────────────────────────

interface Extracted {
  title: string;
  /** English rendering of the headline, for the front page only. */
  titleEn: string;
  summary: string;
  blocks: { kind: "heading" | "paragraph"; text: string }[];
}

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    titleEn: { type: "string" },
    summary: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["heading", "paragraph"] },
          text: { type: "string" },
        },
        required: ["kind", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "titleEn", "summary", "blocks"],
  additionalProperties: false,
};

async function extractArticle(pageText: string): Promise<Extracted> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You extract the readable body of a French news article from the raw text of a " +
          "web page. Return only valid JSON matching the schema exactly.",
      },
      {
        role: "user",
        content:
          `Raw page text:\n"""${pageText}"""\n\n` +
          `Return the ARTICLE ONLY, in the original French, verbatim — do not ` +
          `translate, summarise, rewrite or shorten the body.\n` +
          `- "title": the article's headline.\n` +
          `- "titleEn": that headline in natural English — what the piece is ABOUT, ` +
          `so a learner can decide whether to read it. Not a literal word-for-word ` +
          `rendering. This is the only English you return.\n` +
          `- "summary": one or two sentences of French introducing the piece ` +
          `(use the standfirst if there is one, otherwise write one).\n` +
          `- "blocks": the body in order, one entry per paragraph, with ` +
          `"kind":"paragraph"; use "kind":"heading" for section headings.\n` +
          `DISCARD navigation, menus, cookie and newsletter banners, share ` +
          `widgets, related-article lists, bylines, timestamps, captions, ` +
          `advertisements and comments. If the page is a paywall stub, a consent ` +
          `wall or otherwise has no real article body, return an empty "blocks" array.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "article_extraction", strict: true, schema: EXTRACT_SCHEMA },
    } as never,
  });

  const raw = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
  return {
    title: parsed.title ?? "",
    titleEn: parsed.titleEn ?? "",
    summary: parsed.summary ?? "",
    blocks: (parsed.blocks ?? []).filter(
      (b: { text?: string }) => typeof b.text === "string" && b.text.trim().length > 0
    ),
  };
}

// ─── Glossing ─────────────────────────────────────────────────────────────────

interface GlossPayload {
  glosses: { surface: string; lemma: string; gloss: string }[];
  /**
   * Per-occurrence overrides. `cue` is the 1-based numbered block within the
   * batch. Without these one surface form gets one gloss for the whole batch,
   * so the most frequent reading of a homograph wins everywhere.
   */
  contextual: ContextualGloss[];
  expressions: { phrase: string; gloss: string }[];
}

const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    glosses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          surface: { type: "string" },
          lemma: { type: "string" },
          gloss: { type: "string" },
        },
        required: ["surface", "lemma", "gloss"],
        additionalProperties: false,
      },
    },
    contextual: CONTEXTUAL_SCHEMA,
    expressions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phrase: { type: "string" },
          gloss: { type: "string" },
        },
        required: ["phrase", "gloss"],
        additionalProperties: false,
      },
    },
  },
  required: ["glosses", "contextual", "expressions"],
  additionalProperties: false,
};

/**
 * High-frequency French multi-word expressions, always grouped when they
 * appear. The model alone is inconsistent about the most common ones, so these
 * are matched deterministically as a floor, then laid down longest-first so
 * "comment ça va" wins over "ça va".
 *
 * Written journalism leans on a different set of connectives than speech, so
 * this list is the spoken core plus the ones that actually turn up in prose.
 */
const COMMON_EXPRESSIONS: { phrase: string; gloss: string }[] = [
  { phrase: "qu'est-ce que", gloss: "what (question)" },
  { phrase: "qu'est-ce qui", gloss: "what (subject question)" },
  { phrase: "est-ce que", gloss: "(question marker)" },
  { phrase: "d'autant plus que", gloss: "all the more so because" },
  { phrase: "dans la mesure où", gloss: "insofar as" },
  { phrase: "en ce qui concerne", gloss: "as regards" },
  { phrase: "à l'heure actuelle", gloss: "at present" },
  { phrase: "de plus en plus", gloss: "more and more" },
  { phrase: "de moins en moins", gloss: "less and less" },
  { phrase: "il s'agit de", gloss: "it is a matter of" },
  { phrase: "y compris", gloss: "including" },
  { phrase: "au-delà de", gloss: "beyond" },
  { phrase: "à partir de", gloss: "from / starting from" },
  { phrase: "au cours de", gloss: "during" },
  { phrase: "à l'issue de", gloss: "at the end of" },
  { phrase: "en raison de", gloss: "because of" },
  { phrase: "faute de", gloss: "for lack of" },
  { phrase: "au sein de", gloss: "within" },
  { phrase: "vis-à-vis de", gloss: "towards / regarding" },
  { phrase: "par ailleurs", gloss: "moreover" },
  { phrase: "en revanche", gloss: "on the other hand" },
  { phrase: "en effet", gloss: "indeed" },
  { phrase: "de toute façon", gloss: "anyway" },
  { phrase: "avoir besoin de", gloss: "to need" },
  { phrase: "avoir envie de", gloss: "to feel like" },
  { phrase: "se rendre compte", gloss: "to realise" },
  { phrase: "mettre en place", gloss: "to set up" },
  { phrase: "mettre en œuvre", gloss: "to implement" },
  { phrase: "faire face à", gloss: "to face" },
  { phrase: "faire partie de", gloss: "to be part of" },
  { phrase: "en train de", gloss: "in the middle of" },
  { phrase: "faire attention", gloss: "to pay attention" },
  { phrase: "tout le monde", gloss: "everyone" },
  { phrase: "à peu près", gloss: "roughly" },
  { phrase: "en même temps", gloss: "at the same time" },
  { phrase: "tout de suite", gloss: "right away" },
  { phrase: "tout de même", gloss: "all the same" },
  { phrase: "pas du tout", gloss: "not at all" },
  { phrase: "au lieu de", gloss: "instead of" },
  { phrase: "à cause de", gloss: "because of" },
  { phrase: "petit à petit", gloss: "little by little" },
  { phrase: "plus ou moins", gloss: "more or less" },
  { phrase: "c'est-à-dire", gloss: "that is to say" },
  { phrase: "par exemple", gloss: "for example" },
  { phrase: "tout à fait", gloss: "absolutely" },
  { phrase: "quand même", gloss: "still / anyway" },
  { phrase: "bien sûr", gloss: "of course" },
  { phrase: "en fait", gloss: "actually" },
  { phrase: "du coup", gloss: "so / as a result" },
  { phrase: "par contre", gloss: "on the other hand" },
  { phrase: "peut-être", gloss: "maybe" },
  { phrase: "beaucoup de", gloss: "a lot of" },
  { phrase: "grâce à", gloss: "thanks to" },
  { phrase: "il y a", gloss: "there is / there are" },
  { phrase: "il faut", gloss: "one must / it is necessary" },
  { phrase: "afin de", gloss: "in order to" },
  { phrase: "alors que", gloss: "whereas / while" },
  { phrase: "tandis que", gloss: "whereas" },
  { phrase: "bien que", gloss: "although" },
  { phrase: "ainsi que", gloss: "as well as" },
  { phrase: "lors de", gloss: "at the time of" },
  { phrase: "à la fois", gloss: "at once" },
];

/** Determiners an expression should never open with — that's a noun phrase. */
const LEADING_DETERMINERS = new Set([
  "un", "une", "le", "la", "les", "des", "du", "au", "aux",
  "ce", "cet", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
  "mon", "ma", "mes", "ton", "ta", "tes", "notre", "nos", "votre", "vos",
  "d'un", "d'une", "l'", "d'", "quelques", "plusieurs", "certains",
  "celui", "celle", "ceux", "celles",
]);

/**
 * The closed-class core of French. The model skips these often enough — they're
 * "obvious" — that a reader hovering "a" or "y" would get nothing, and those are
 * exactly the words a learner is unsure about. Used only as a fallback, so a
 * context-specific gloss from the model always wins.
 */
const FUNCTION_WORDS: Record<string, string> = {
  a: "has", ai: "have", as: "have", ont: "have", avait: "had", avaient: "had",
  est: "is", sont: "are", était: "was", étaient: "were", été: "been", être: "to be",
  suis: "am", es: "are", sera: "will be", seront: "will be", soit: "be (subjunctive)",
  le: "the", la: "the", les: "the", un: "a", une: "a", des: "some / of the",
  du: "of the / some", au: "at the / to the", aux: "to the", de: "of / from",
  à: "to / at", en: "in / of it", y: "there / to it", et: "and", ou: "or",
  mais: "but", donc: "so", car: "because", ni: "nor", que: "that / which",
  qui: "who / which", quoi: "what", dont: "of which / whose", où: "where",
  ce: "this / it", cet: "this", cette: "this", ces: "these", cela: "that", ça: "that",
  celui: "the one", celle: "the one", ceux: "those", celles: "those",
  je: "I", tu: "you", il: "he / it", elle: "she / it", on: "one / we",
  nous: "we / us", vous: "you", ils: "they", elles: "they",
  me: "me / myself", te: "you", se: "oneself", lui: "him / to him", leur: "their / to them",
  mon: "my", ma: "my", mes: "my", son: "his / her", sa: "his / her", ses: "his / her",
  notre: "our", nos: "our", votre: "your", vos: "your", leurs: "their",
  ne: "not", pas: "not", plus: "more / no longer", moins: "less", très: "very",
  bien: "well", aussi: "also", encore: "still / again", déjà: "already",
  toujours: "always", jamais: "never", souvent: "often", parfois: "sometimes",
  peu: "little", trop: "too much", assez: "enough", tout: "all", tous: "all",
  toute: "all", toutes: "all", même: "same / even", autre: "other", autres: "other",
  pour: "for", par: "by", sur: "on", sous: "under", dans: "in", avec: "with",
  sans: "without", chez: "at (someone's)", vers: "towards", entre: "between",
  depuis: "since / for", pendant: "during", avant: "before", après: "after",
  contre: "against", selon: "according to", malgré: "despite", parmi: "among",
  quand: "when", comme: "as / like", si: "if", alors: "then", ainsi: "thus",
  puis: "then", enfin: "finally", ici: "here", là: "there", oui: "yes", non: "no",
  fait: "does / made", faire: "to do / make", peut: "can", peuvent: "can",
  doit: "must", va: "goes", vont: "go", dit: "says",
};

/**
 * French elides articles and inverts subjects onto the verb, and this script
 * deliberately keeps those whole as one hover target ("l'écart", not "l'" +
 * "écart"). The model, though, glosses the bare word — so a direct lookup
 * misses. Yields the surface plus progressively stripped forms to try.
 */
function lookupCandidates(surface: string): string[] {
  const base = surface.toLowerCase().replace(/[’]/g, "'");
  const out = [base];
  // Leading elided article or pronoun: l'écart, d'ABC, qu'elles, n'est.
  const deElided = base.replace(/^(?:[cdjlmnstl]|qu|jusqu|lorsqu|puisqu)'/, "");
  if (deElided !== base) out.push(deElided);
  for (const form of [...out]) {
    // Inverted subject on the verb: explique-t-il, poursuit-elle, dit-on.
    const deInverted = form.replace(/-(?:t-)?(?:il|elle|ils|elles|on|je|tu|nous|vous)$/, "");
    if (deInverted !== form) out.push(deInverted);
  }
  return out;
}

/**
 * Reject the junk the model reliably produces: one-off descriptive phrases that
 * are not worth memorising. Deterministic on purpose — the prompt asks for the
 * same thing, but prompts drift and a bad expression is worse than a missing
 * one, because it swallows several words into a single useless underline.
 *
 * Caught here, from a real run: "En Australie", "au large de Kingscliff",
 * "Un bénévole d'ORRCA", "auprès d'ABC", "seulement la quatrième fois".
 */
function isUsefulExpression(phrase: string): boolean {
  const trimmed = phrase.trim();
  const words = trimmed.match(WORD_RE) ?? [];
  if (words.length < 2 || words.length > 5) return false;
  // Digits mean a date, a count or a measurement — always one-off.
  if (/\d/.test(trimmed)) return false;
  // A capitalised word anywhere but the front is a proper noun: a person, a
  // place or an organisation, none of which belong in a phrasebook.
  if (words.slice(1).some((w) => /^[A-ZÀ-Þ]/.test(w))) return false;
  // Opening on a determiner means it's a noun phrase ("des images
  // exceptionnelles"), not a fixed expression.
  const first = words[0].toLowerCase().replace(/[’]/g, "'");
  if (LEADING_DETERMINERS.has(first)) return false;
  return true;
}

/** See ingest-video.ts's breakdownBatch — same idea, "block" instead of "cue". */
export async function breakdownBatch(blockTexts: string[]): Promise<BreakdownPayload> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You help English speakers read French. Return only valid JSON matching the schema exactly.",
      },
      {
        role: "user",
        content:
          `French article, one numbered block per line:\n"""\n${renderBatch(blockTexts)}\n"""\n\n` +
          breakdownInstruction(blockTexts.length, "block"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "block_breakdown", strict: true, schema: BREAKDOWN_SCHEMA },
    } as never,
  });
  const raw = response.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    return { lines: parsed.lines ?? [] };
  } catch {
    return { lines: [] };
  }
}

export async function glossBatch(blockTexts: string[]): Promise<GlossPayload> {
  // Blocks are numbered rather than newline-joined so the model can point a
  // contextual gloss at a specific one.
  // Newlines inside a block would break the one-block-per-line contract the
  // numbering depends on.
  const text = blockTexts.map((t, i) => `[${i + 1}] ${t.replace(/\s+/g, " ").trim()}`).join("\n");
  const note = ambiguousNote(blockTexts.join(" "), "block");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You help English speakers read French. Return only valid JSON matching the schema exactly.",
      },
      {
        role: "user",
        content:
          `French article excerpt, one numbered block per line:\n"""\n${text}\n"""\n\n` +
          `1) "glosses": for every distinct French word above, give its dictionary form ` +
          `("lemma") and a concise English meaning as used here ("gloss", 1-5 words). ` +
          `Copy "surface" exactly as it appears, accents preserved.\n` +
          `1b) "contextual": the entries in "glosses" apply to the whole excerpt, so they ` +
          `cannot express a word that means different things in different blocks. When a ` +
          `surface form's LEMMA or MEANING depends on where it appears, add one entry per ` +
          `occurrence here: "cue" is the bracketed block number — an integer between 1 and ` +
          `${blockTexts.length}, never any other value — "surface" copied exactly, ` +
          `plus the lemma and gloss correct FOR THAT BLOCK. Leave this array empty only if ` +
          `nothing in the excerpt is ambiguous.\n` +
          `2) "expressions": multi-word expressions of 2-5 words appearing VERBATIM ` +
          `above that a learner should memorise as a SINGLE UNIT rather than word by ` +
          `word. The test is "would a teacher or phrasebook present this as one chunk?" ` +
          `— not "is its meaning non-obvious". INCLUDE: fixed phrases ("tout à fait", ` +
          `"bien sûr"), connectives and discourse markers common in journalism ` +
          `("en revanche", "par ailleurs", "en effet", "dans la mesure où"), ` +
          `grammatical chunks ("il y a", "est-ce que", "il faut", "il s'agit de"), ` +
          `complex prepositions ("au cours de", "en raison de", "au sein de"), and ` +
          `verbs with their fixed preposition or complement ("avoir besoin de", ` +
          `"mettre en place", "faire face à", "mettre bas").\n` +
          `The phrase must be REUSABLE in a completely different article. If it ` +
          `only makes sense in this one, it is wrong.\n` +
          `EXCLUDE, without exception:\n` +
          `- anything containing a name of a person, place, organisation or brand ` +
          `("En Australie", "au large de Kingscliff", "auprès d'ABC") — if the ` +
          `underlying expression is useful, return only the reusable part ` +
          `("au large de", "auprès de");\n` +
          `- plain noun phrases, i.e. a determiner or adjective plus a noun ` +
          `("des images exceptionnelles", "enregistrement par drone", ` +
          `"les régions tropicales");\n` +
          `- phrases containing a number or a date ("la quatrième fois");\n` +
          `- full clauses that merely describe an event ("le président a ` +
          `déclaré", "un drone filme la naissance");\n` +
          `- single words — every entry must be at least two words.\n` +
          `Copy each phrase exactly as it appears, accents and elisions preserved.` +
          note,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "article_glosses", strict: true, schema: GLOSS_SCHEMA },
    } as never,
  });

  const raw = response.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    return {
      glosses: parsed.glosses ?? [],
      contextual: parsed.contextual ?? [],
      expressions: parsed.expressions ?? [],
    };
  } catch {
    // A malformed batch costs a few missing glosses, not the whole ingest.
    return { glosses: [], contextual: [], expressions: [] };
  }
}

/**
 * Second pass over whatever the main gloss call skipped.
 *
 * The batch prompt asks for "every distinct word" and reliably misses a
 * handful — inflected forms, and names it assumes need no explanation. Hovering
 * a word and getting nothing is the one thing this feature cannot do, so the
 * leftovers get their own targeted request.
 */
async function glossLeftovers(surfaces: string[]): Promise<Map<string, { lemma: string; gloss: string }>> {
  const out = new Map<string, { lemma: string; gloss: string }>();
  if (!surfaces.length) return out;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You help English speakers read French. Return only valid JSON matching the schema exactly.",
      },
      {
        role: "user",
        content:
          `Give a dictionary form ("lemma") and a concise English meaning ` +
          `("gloss", 1-5 words) for EVERY item in this list of French words, ` +
          `without exception. Copy "surface" back exactly as given.\n` +
          `If an item is a proper noun, say what it is instead ` +
          `(e.g. "ABC" → "Australian broadcaster"). If it is an inflected verb, ` +
          `gloss it as used and give the infinitive as the lemma.\n` +
          `Leave "expressions" empty.\n\n${JSON.stringify(surfaces)}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "article_glosses", strict: true, schema: GLOSS_SCHEMA },
    } as never,
  });

  const raw = response.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    for (const g of parsed.glosses ?? []) {
      if (g?.surface) out.set(String(g.surface).toLowerCase(), { lemma: g.lemma, gloss: g.gloss });
    }
  } catch {
    // Leftovers stay ungloassed rather than failing the whole ingest.
  }
  return out;
}

/**
 * Lay tokens over one block: expressions first (longest first, so the longer
 * idiom wins when two overlap), then any word not already covered. Expressions
 * become a single span so they render with one continuous underline and one
 * hover card rather than one per word.
 */
function buildTokens(
  text: string,
  glossBy: Map<string, { lemma: string; gloss: string }>,
  expressions: { phrase: string; gloss: string }[],
  /** Per-occurrence overrides for this block only; beats the batch-wide glossBy. */
  contextualBy?: Map<string, { lemma: string; gloss: string }>,
  /** This block's sentence breakdown, already validated. Beats both maps. */
  parts?: BreakdownPart[]
): Token[] {
  const claimed: Token[] = [];
  const overlaps = (s: number, e: number) => claimed.some((t) => s < t.e && e > t.s);
  const lower = text.toLowerCase();

  for (const { phrase, gloss } of [...expressions].sort((a, b) => b.phrase.length - a.phrase.length)) {
    const needle = phrase.toLowerCase().trim();
    if (needle.length < 3) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      // Require whole-token boundaries so "il y a" doesn't match inside a word.
      const before = at === 0 || !/[A-Za-zÀ-ÿŒœÆæ]/.test(text[at - 1]);
      const after = end === text.length || !/[A-Za-zÀ-ÿŒœÆæ]/.test(text[end]);
      if (before && after && !overlaps(at, end)) {
        claimed.push({ s: at, e: end, surface: text.slice(at, end), gloss, kind: "expression" });
      }
      from = at + needle.length;
    }
  }

  const matches = [...text.matchAll(WORD_RE)];
  // Word number (1-based) -> the breakdown piece covering it, so a grouped
  // piece like "suis allé" is emitted once as a single span.
  const partAt = new Map<number, BreakdownPart>();
  for (const p of parts ?? []) {
    for (let i = p.from; i <= p.to; i++) partAt.set(i, p);
  }

  const seen: string[] = [];
  const spanOf = (from: number, to: number) => {
    const a = matches[from], b = matches[to - 1];
    return [a.index ?? 0, (b.index ?? 0) + b[0].length] as const;
  };

  let i = 0;
  while (i < matches.length) {
    const part = partAt.get(i + 1);
    // Only take a group whole if no expression already claimed part of it,
    // otherwise the remainder would be silently swallowed.
    let last = part ? Math.min(part.to, matches.length) : i + 1;
    if (last > i + 1) {
      const [gs, ge] = spanOf(i, last);
      if (overlaps(gs, ge)) last = i + 1;
    }
    const usingPart = part !== undefined && last === Math.min(part.to, matches.length);
    const [s, e] = spanOf(i, last);
    // Span the raw text so punctuation inside a group ("n'ont pas") is kept.
    const surface = text.slice(s, e);
    const spanned = matches.slice(i, last).map((m) => m[0]);
    const before = [...seen];
    spanned.forEach((w) => seen.push(w.toLowerCase()));
    i = last;
    if (overlaps(s, e)) continue;

    // Grammar first, then the breakdown piece (it read the sentence), then the
    // block-specific reading, then the batch-wide one, then the closed-class map.
    const candidates = lookupCandidates(spanned[0]);
    let g: { lemma: string; gloss: string } | undefined =
      (spanned.length === 1 ? decisiveGloss(spanned[0], before) : null) ?? undefined;
    if (!g && usingPart && part) g = { lemma: part.lemma, gloss: part.gloss };
    if (!g) {
      for (const c of candidates) {
        g = contextualBy?.get(c);
        if (g) break;
      }
    }
    if (!g) {
      for (const c of candidates) {
        g = glossBy.get(c);
        if (g) break;
      }
    }
    const fallback = g ? undefined : candidates.map((c) => FUNCTION_WORDS[c]).find(Boolean);
    claimed.push({
      s, e, surface,
      lemma: g?.lemma && g.lemma.toLowerCase() !== surface.toLowerCase() ? g.lemma : undefined,
      gloss: g?.gloss ?? fallback ?? "",
      // A grouped piece renders like an idiom: one underline, one hover card.
      kind: spanned.length > 1 ? "expression" : "word",
    });
  }

  return claimed.sort((a, b) => a.s - b.s);
}

// ─── dict_cache (same table the dictionary uses; global, no TTL) ──────────────

async function cachedGloss(key: string): Promise<GlossPayload | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dictCache).where(eq(dictCache.termKey, key));
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].entryJson); } catch { return null; }
}

async function cachedBreakdown(key: string): Promise<BreakdownPayload | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dictCache).where(eq(dictCache.termKey, key));
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].entryJson); } catch { return null; }
}

async function putBreakdown(key: string, value: BreakdownPayload) {
  const db = await getDb();
  if (!db) return;
  await db.insert(dictCache)
    .values({ termKey: key, entryJson: JSON.stringify(value), createdAt: Date.now() })
    .onDuplicateKeyUpdate({ set: { entryJson: JSON.stringify(value), createdAt: Date.now() } });
}

async function putGloss(key: string, value: GlossPayload) {
  const db = await getDb();
  if (!db) return;
  await db.insert(dictCache)
    .values({ termKey: key, entryJson: JSON.stringify(value), createdAt: Date.now() })
    .onDuplicateKeyUpdate({ set: { entryJson: JSON.stringify(value), createdAt: Date.now() } });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents so the slug is URL-safe
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/, "");
  return base || `article-${Date.now()}`;
}

function countWords(blocks: { text: string }[]): number {
  return blocks.reduce((n, b) => n + (b.text.match(WORD_RE)?.length ?? 0), 0);
}

/** Trim from the end so an over-long piece stays whole paragraphs. */
function capToWordBudget<T extends { text: string }>(blocks: T[], maxWords: number): T[] {
  const out: T[] = [];
  let total = 0;
  for (const b of blocks) {
    const n = b.text.match(WORD_RE)?.length ?? 0;
    if (total + n > maxWords && out.length) break;
    out.push(b);
    total += n;
  }
  return out;
}

function flag(rest: string[], name: string): string | null {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] ?? null : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const filePath = flag(argv, "--file");
  const url = argv.find((a) => /^https?:\/\//i.test(a)) ?? null;

  if (!url && !filePath) {
    console.error("usage: tsx scripts/ingest-article.ts <url> [--level B1] [--max-words 1200]");
    console.error("       tsx scripts/ingest-article.ts --file piece.txt --title \"…\" --source \"…\"");
    console.error("  run under `railway run --` so DATABASE_URL and OPENAI_API_KEY are set");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set — run this under `railway run --`");
  }

  const level = flag(argv, "--level");
  // Which shelf this lands on in the Reading tab. Free text so a new source is
  // an argument, not a migration.
  const section = flag(argv, "--section");
  const maxWords = Number(flag(argv, "--max-words") ?? DEFAULT_MAX_WORDS);
  if (!Number.isFinite(maxWords) || maxWords <= 0) throw new Error("--max-words needs a positive number");
  const minWords = Number(flag(argv, "--min-words") ?? DEFAULT_MIN_WORDS);
  if (!Number.isFinite(minWords) || minWords < 0) throw new Error("--min-words needs a non-negative number");

  const db = await getDb();
  if (!db) throw new Error("No DATABASE_URL — run under `railway run --`");

  // ── Source text ──────────────────────────────────────────────────────────
  let pageText: string;
  let source = flag(argv, "--source");
  let imageUrl: string | null = null;
  let publishedAt: number | null = null;
  let titleHint = flag(argv, "--title");

  if (filePath) {
    console.log(`• reading ${filePath}`);
    pageText = (await readFile(filePath, "utf8")).trim();
  } else {
    console.log(`• fetching ${url}`);
    const resp = await fetch(url!, { headers: { "user-agent": UA, "accept-language": "fr" }, redirect: "follow" });
    if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${resp.statusText}`);
    const html = await resp.text();

    // Metadata straight from the page beats asking the model for it.
    source ??= meta(html, "og:site_name") ?? new URL(url!).hostname.replace(/^www\./, "");
    imageUrl = meta(html, "og:image");
    titleHint ??= meta(html, "og:title");
    const pub = meta(html, "article:published_time") ?? meta(html, "og:published_time");
    if (pub) {
      const t = Date.parse(pub);
      if (Number.isFinite(t)) publishedAt = t;
    }

    pageText = htmlToText(html);
    console.log(`  ${html.length} bytes of HTML → ${pageText.length} chars of text`);
  }

  if (pageText.length < 200) {
    throw new Error("almost no text on that page — it is probably JS-rendered or a consent wall; use --file");
  }

  // ── Extract ──────────────────────────────────────────────────────────────
  console.log("• extracting the article body");
  const extracted = await extractArticle(pageText.slice(0, MAX_EXTRACT_CHARS));
  if (!extracted.blocks.length) {
    throw new Error(
      "no article body found — the page is likely a paywall or consent wall.\n" +
      "  paste the text into a file and re-run with --file <path> --title \"…\" --source \"…\""
    );
  }

  const title = (titleHint || extracted.title || "Article").trim();
  const slug = flag(argv, "--slug") ?? slugify(title);
  const blocksIn = capToWordBudget(extracted.blocks, maxWords);
  const dropped = extracted.blocks.length - blocksIn.length;
  const words = countWords(blocksIn);
  console.log(`  "${title}" — ${blocksIn.length} blocks, ${words} words${dropped ? ` (${dropped} trimmed to fit --max-words)` : ""}`);

  // Checked before any glossing, so a stub costs one extraction call rather
  // than a whole pipeline run — and never reaches the feed.
  if (words < minWords) {
    throw new Error(
      `only ${words} words (minimum ${minWords}) — this is a teaser, a video blurb or a paywall stub, not an article.
` +
      `  pass --min-words ${Math.max(0, words - 1)} to ingest it anyway.`
    );
  }

  const blocks: Block[] = blocksIn.map((b, i) => ({
    idx: i,
    kind: b.kind === "heading" ? "heading" : "paragraph",
    text: b.text.trim(),
    tokens: [],
  }));

  // ── Gloss ────────────────────────────────────────────────────────────────
  // Batched by character count: paragraphs vary far more in length than
  // transcript cues do, so a fixed count per batch would swing wildly.
  const batches: Block[][] = [];
  let current: Block[] = [];
  let currentChars = 0;
  for (const b of blocks) {
    if (currentChars + b.text.length > CHARS_PER_GLOSS_BATCH && current.length) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(b);
    currentChars += b.text.length;
  }
  if (current.length) batches.push(current);

  console.log(`• glossing ${blocks.length} blocks in ${batches.length} batches`);
  const payloads = new Array<GlossPayload>(batches.length);
  const breakdowns = new Array<BreakdownPayload>(batches.length);
  for (let i = 0; i < batches.length; i += GLOSS_CONCURRENCY) {
    await Promise.all(
      batches.slice(i, i + GLOSS_CONCURRENCY).map(async (batch, k) => {
        const at = i + k;
        // Bump these when the prompts change, so a re-run gets fresh output
        // instead of replaying the answers to the old question.
        // v5: blocks are broken down sentence-first; the per-word pass stays as
        // the fallback for anything the breakdown does not cover.
        const gKey = `agloss::v5::${slug}::${at}`;
        const bKey = `abreak::v3::${slug}::${at}`;
        const texts = batch.map((b) => b.text);
        const [gHit, bHit] = await Promise.all([cachedGloss(gKey), cachedBreakdown(bKey)]);
        const [got, broke] = await Promise.all([
          gHit ? Promise.resolve(gHit) : glossBatch(texts).then(async (r) => { await putGloss(gKey, r); return r; }),
          bHit ? Promise.resolve(bHit) : breakdownInChunks(texts, breakdownBatch).then(async (r) => { await putBreakdown(bKey, r); return r; }),
        ]);
        payloads[at] = got;
        breakdowns[at] = broke;
      })
    );
    console.log(`  ${Math.min(i + GLOSS_CONCURRENCY, batches.length)}/${batches.length} batches`);
  }

  let rejected = 0;
  batches.forEach((batch, bi) => {
    const p = payloads[bi] ?? { glosses: [], contextual: [], expressions: [] };
    const glossBy = new Map(
      p.glosses.map((g) => [g.surface.toLowerCase(), { lemma: g.lemma, gloss: g.gloss }])
    );
    const contextualByBlock = bucketContextual(p.contextual, batch.length);
    // The curated lexicon is vetted and bypasses the filter; only the model's
    // suggestions have to earn their place.
    const kept = p.expressions.filter((e) => isUsefulExpression(e.phrase) && isShortEnoughToGroup(e.phrase));
    rejected += p.expressions.length - kept.length;
    const byLine = new Map((breakdowns[bi]?.lines ?? []).map((l) => [l.line, l]));
    batch.forEach((b, ci) => {
      const line = byLine.get(ci + 1);
      // Only parts that actually describe the words they point at survive;
      // anything else falls through to the older per-word glosses.
      const parts = line ? validateParts(line.parts ?? [], wordsOf(b.text)) : [];
      b.translationEn = line?.en?.trim() || undefined;
      b.tokens = buildTokens(
        b.text,
        glossBy,
        // Kept even when a breakdown exists: the model under-groups at batch
        // scale (a 353-word article came back with zero groups), and this list
        // is vetted, so it stays the floor for idioms.
        [...kept, ...COMMON_EXPRESSIONS],
        contextualByBlock.get(ci + 1),
        parts
      );
    });
  });
  if (rejected) console.log(`  filtered out ${rejected} one-off "expressions"`);

  // Sweep: anything the batches skipped gets one targeted request, capped so a
  // pathological article can't turn into a huge prompt.
  // Asked for by their bare form: the model reliably drops elided items
  // ("l'écart", "J'espère") from a list it is given, but answers happily for
  // "écart" and "espère". lookupCandidates matches the answer back onto the
  // original surface.
  const leftovers = [
    ...new Set(
      blocks.flatMap((b) =>
        b.tokens
          .filter((t) => t.kind === "word" && !t.gloss)
          .map((t) => {
            const forms = lookupCandidates(t.surface);
            return forms[forms.length - 1];
          })
      )
    ),
  ].slice(0, 150);
  if (leftovers.length) {
    console.log(`• glossing ${leftovers.length} words the first pass missed`);
    const extra = await glossLeftovers(leftovers);
    let filled = 0;
    for (const b of blocks) {
      for (const t of b.tokens) {
        if (t.kind !== "word" || t.gloss) continue;
        const hit = lookupCandidates(t.surface).map((c) => extra.get(c)).find(Boolean);
        if (!hit) continue;
        t.gloss = hit.gloss;
        if (hit.lemma && hit.lemma.toLowerCase() !== t.surface.toLowerCase()) t.lemma = hit.lemma;
        filled++;
      }
    }
    console.log(`  filled ${filled} of ${leftovers.length}`);
  }

  // ── Write ────────────────────────────────────────────────────────────────
  console.log("• writing to database");
  const wordCount = countWords(blocks);
  const row = {
    title,
    source: source ?? null,
    url: url ?? null,
    summary: extracted.summary || null,
    imageUrl,
    level,
    wordCount,
    publishedAt,
    section,
    titleEn: extracted.titleEn?.trim() || null,
  };

  const existing = await db.select().from(articles).where(eq(articles.slug, slug));
  let articleId: number;
  if (existing.length) {
    articleId = existing[0].id;
    await db.update(articles).set(row).where(eq(articles.id, articleId));
    await db.delete(articleBlocks).where(eq(articleBlocks.articleId, articleId));
  } else {
    await db.insert(articles).values({ ...row, slug, addedAt: Date.now() });
    const rows = await db.select().from(articles).where(eq(articles.slug, slug));
    articleId = rows[0].id;
  }

  for (let i = 0; i < blocks.length; i += 100) {
    await db.insert(articleBlocks).values(
      blocks.slice(i, i + 100).map((b) => ({
        articleId, idx: b.idx, kind: b.kind,
        text: b.text, tokensJson: JSON.stringify(b.tokens),
        translationEn: b.translationEn ?? null,
      }))
    );
  }

  const tokenCount = blocks.reduce((n, b) => n + b.tokens.length, 0);
  const exprCount = blocks.reduce((n, b) => n + b.tokens.filter((t) => t.kind === "expression").length, 0);
  console.log(`✓ ${title}`);
  console.log(`  slug: ${slug}`);
  console.log(`  ${blocks.length} blocks, ${wordCount} words, ${tokenCount} tokens (${exprCount} expressions)`);
  process.exit(0);
}

// Only run the CLI when invoked directly, so tests can import glossBatch
// without kicking off a fetch.
const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error("✗", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
