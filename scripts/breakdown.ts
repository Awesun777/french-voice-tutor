/**
 * Sentence-first glossing, shared by the video and article ingesters.
 *
 * The older approach asked for one gloss per DISTINCT word across a whole batch
 * and keyed the answers by surface form. That cannot express a word whose job
 * comes from its sentence, which is not just a homograph problem:
 *
 *   "Tu la suis"        la  -> "the"   (it is a direct object: her)
 *   "je suis allé"      suis -> "am", allé -> "gone"   (together: went)
 *
 * So the model is asked to translate each line first and then break THAT
 * translation into pieces, which is what a tutor does when you ask them to
 * explain a sentence.
 *
 * The pieces are addressed by OUR word numbering, never by character offsets
 * the model invents. Two reasons: the video reader drives word-level audio
 * highlighting off token offsets, so a model-invented span could desync
 * playback; and asked for cue numbers on a real transcript the model returned
 * 26, 31 and 33 for a 25-cue batch, so its arithmetic cannot be trusted with
 * anything load-bearing. Every returned index is validated against the word it
 * claims to describe before it is used.
 */

/** Same French-aware matcher both ingesters tokenise with. */
const WORD_RE = /[A-Za-zÀ-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÿŒœÆæ]+)*/g;

/** One piece of a broken-down line: words `from`..`to` (1-based, inclusive). */
export interface BreakdownPart {
  from: number;
  to: number;
  /** Copy of the words covered, so we can verify the model addressed what it meant. */
  surface: string;
  lemma: string;
  gloss: string;
}

export interface BreakdownLine {
  line: number;
  en: string;
  parts: BreakdownPart[];
}

export interface BreakdownPayload {
  lines: BreakdownLine[];
}

export const BREAKDOWN_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: "integer" },
          en: { type: "string" },
          parts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from: { type: "integer" },
                to: { type: "integer" },
                surface: { type: "string" },
                lemma: { type: "string" },
                gloss: { type: "string" },
              },
              required: ["from", "to", "surface", "lemma", "gloss"],
              additionalProperties: false,
            },
          },
        },
        required: ["line", "en", "parts"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
} as const;

/** The words of one line, in order, as the model will be shown them. */
export function wordsOf(text: string): string[] {
  return [...text.matchAll(WORD_RE)].map((m) => m[0]);
}

/**
 * Renders the batch the model sees: each line numbered, then its words numbered
 * separately so a part can point at them unambiguously.
 */
export function renderBatch(lineTexts: string[]): string {
  return lineTexts
    .map((t, i) => {
      const flat = t.replace(/\s+/g, " ").trim();
      const numbered = wordsOf(flat).map((w, j) => `${j + 1}·${w}`).join(" ");
      return `[${i + 1}] ${flat}\n     words: ${numbered}`;
    })
    .join("\n");
}

export function breakdownInstruction(lineCount: number, unit: string): string {
  return (
    `For EACH of the ${lineCount} numbered ${unit}s above:\n` +
    `- "line": its bracketed number, an integer from 1 to ${lineCount}.\n` +
    `- "en": a natural English translation of that whole ${unit}. Translate what it ` +
    `MEANS, not word by word.\n` +
    `- "parts": that ${unit} broken into consecutive pieces that together cover EVERY ` +
    `numbered word exactly once, in order, with no gaps and no overlaps. For each piece ` +
    `give "from" and "to" (the word numbers it covers, equal for a single word), ` +
    `"surface" (those words copied exactly), "lemma" (dictionary form, or the word ` +
    `itself when that is the same) and "gloss" (1-5 words of English, its meaning HERE).\n` +
    `GROUP words into one piece when English needs them together, and only then:\n` +
    `- compound tenses and their auxiliary — "suis allé" is ONE piece meaning "went", ` +
    `never "am" plus "gone";\n` +
    `- split negation — "ne ... pas" around a verb;\n` +
    `- reflexive verbs with their pronoun — "je me suis dit" gives "me suis dit" = "said ` +
    `to myself";\n` +
    `- fixed expressions — "il y a" = "there is", "est-ce que" = "(question marker)".\n` +
    `Otherwise keep pieces to a single word. Do NOT swallow a clause into one piece: ` +
    `"à la police" is three pieces, not one.\n` +
    `Gloss each word for the job it does HERE. Object pronouns are not articles: in ` +
    `"Tu la suis", "la" is "her" and "suis" is suivre ("follow"), not être.`
  );
}

/**
 * Longest piece we will accept. Told not to swallow clauses the model does it
 * anyway — a real run produced "quand j'ai dit merci beaucoup" as ONE piece,
 * which robs the learner of every word inside it. The constructions that
 * genuinely need grouping all fit in four words ("je me suis dit", "ne ... pas"
 * around a verb, "il y a"); anything longer is the model over-reaching, and
 * splitting it back into single words loses nothing but the blob.
 */
const MAX_PART_WORDS = 4;

/**
 * Keeps only the parts that are internally consistent and actually describe the
 * words they claim. Anything else is dropped so the caller can fall back.
 *
 * Rejects: out-of-range indices, from > to, overlaps with an earlier accepted
 * part, and — the important one — a "surface" that does not match the words at
 * those positions, which is how a confidently misnumbered part gets caught.
 */
export function validateParts(parts: BreakdownPart[], words: string[]): BreakdownPart[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zà-ÿœæ]/gi, "");
  const kept: BreakdownPart[] = [];
  let covered = 0;

  for (const p of [...parts].sort((a, b) => a.from - b.from)) {
    if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) continue;
    if (p.from < 1 || p.to > words.length || p.from > p.to) continue;
    if (p.to - p.from + 1 > MAX_PART_WORDS) continue;
    if (p.from <= covered) continue; // overlaps something already accepted
    const actual = words.slice(p.from - 1, p.to).join(" ");
    if (norm(actual) !== norm(p.surface)) continue;
    kept.push(p);
    covered = p.to;
  }
  return kept;
}
