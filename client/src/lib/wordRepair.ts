/**
 * Phonetic word-repair support for the voice tutors.
 *
 * The problem this solves is upstream of the tutor. Speech reaches Anna as
 * text, so a learner mispronouncing "grenouille" doesn't produce a mangled
 * sound the model can puzzle over — it produces confident, wrong text like
 * "grand nouille". Anna has her own previous turns in context, but nothing
 * tells her the student's word might be a corrupted echo of one of them.
 *
 * Two halves, matching the two ways it goes wrong:
 *
 *   1. She answers confidently about the wrong word — she has no idea anything
 *      broke. `REPAIR_INSTRUCTION` tells her to be suspicious when a word
 *      doesn't fit what she just said.
 *   2. She knows she's lost and asks you to repeat. `candidateUpdate` gives her
 *      an explicit shortlist of what you probably meant.
 *
 * Anna's base prompt lives in the ElevenLabs dashboard rather than this repo,
 * so both arrive as contextual updates at runtime.
 */

/**
 * Sent once per session. Deliberately concrete about the confirmation format:
 * left vague, models tend to silently guess, which is the failure we are trying
 * to remove rather than relocate.
 */
export const REPAIR_INSTRUCTION =
  "Word-repair rule: this student is a beginner, so their pronunciation often " +
  "reaches you as the wrong word entirely. If they ask about a word and it is " +
  "not recognisable French, or is real French that does not fit what you were " +
  "just talking about, do NOT answer about it. Assume it is a mishearing of a " +
  "word YOU used in your last few turns, match it by sound rather than " +
  "spelling, and confirm before explaining — « Tu veux dire “grenouille” ? ». " +
  "If two of your recent words are equally close, offer both. Only ask them to " +
  "repeat if nothing you said is a plausible match.";

/**
 * French function words. Excluded from the candidate list because a learner
 * never stops to ask what "dans" means, and every turn is full of them — they
 * would crowd out the content words that actually get asked about.
 */
const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "au", "aux", "à",
  "et", "ou", "mais", "donc", "car", "ni", "que", "qui", "quoi", "dont", "où",
  "ce", "cet", "cette", "ces", "cela", "ça", "celui", "celle", "ceux", "celles",
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "me", "te",
  "se", "lui", "leur", "moi", "toi", "soi", "y", "en",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses", "notre", "nos",
  "votre", "vos", "leurs",
  "ne", "pas", "plus", "moins", "très", "bien", "aussi", "encore", "déjà",
  "toujours", "jamais", "souvent", "peu", "trop", "assez", "tout", "tous",
  "toute", "toutes", "même", "autre", "autres", "si", "alors", "ainsi", "puis",
  "pour", "par", "sur", "sous", "dans", "avec", "sans", "chez", "vers", "entre",
  "depuis", "pendant", "avant", "après", "contre", "selon", "comme", "quand",
  "est", "es", "suis", "sommes", "êtes", "sont", "était", "étais", "étaient",
  "être", "ai", "as", "a", "avons", "avez", "ont", "avait", "avais", "avaient",
  "avoir", "fait", "fais", "faire", "va", "vas", "vont", "aller", "peux",
  "peut", "pouvez", "pouvoir", "veux", "veut", "voulez", "vouloir", "dois",
  "doit", "devez", "c", "j", "l", "m", "n", "s", "t", "qu", "oui", "non",
  "merci", "bonjour", "salut", "voilà", "alors", "euh",
]);

/**
 * Letters plus internal apostrophes and hyphens, matching the ingest scripts.
 * Œ/œ and Æ/æ are named explicitly: they sit outside the À-ÿ range, so without
 * them "sœur" tokenises as "s" + "ur".
 */
const WORD_RE = /[A-Za-zÀ-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÿŒœÆæ]+)*/g;

/**
 * The words from one of Anna's turns worth offering as candidates: content
 * words only, in order, deduplicated, longer than two letters.
 *
 * Short words are dropped because they are almost all function words that the
 * stoplist can't practically enumerate, and because two-letter tokens match
 * far too many things by sound to be useful candidates.
 */
export function contentWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(WORD_RE))) {
    // Offer "étang", not "l'étang": the student asks about the noun, and the
    // elided article is not part of what they are trying to pronounce.
    const word = m[0].replace(/^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu)['’]/i, "");
    if (!word) continue;
    const key = word.toLowerCase().replace(/[’]/g, "'");
    if (key.length <= 2) continue;
    if (STOPWORDS.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

/** Most candidates worth naming at once. Beyond this it stops being a shortlist. */
export const MAX_CANDIDATES = 10;

/**
 * The contextual update naming what the student can plausibly be asking about.
 * Returns null when a turn contributed nothing worth listing, so the caller can
 * skip sending an empty message.
 */
export function candidateUpdate(words: string[]): string | null {
  const list = words.slice(-MAX_CANDIDATES);
  if (!list.length) return null;
  return (
    `[Words you just used, in case the student asks about one and their ` +
    `pronunciation makes it hard to place: ${list.join(", ")}. ` +
    `Match by sound and confirm before explaining.]`
  );
}
