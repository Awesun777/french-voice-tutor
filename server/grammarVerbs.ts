/**
 * Grammar Test — verb bank and tense configuration.
 *
 * The tested tenses map onto the same six conjugation sets the dictionary
 * already produces. "Past participle" is tested as the passé composé, since a
 * fill-in-the-blank sentence needs the full auxiliary + participle form.
 */

export type TenseKey =
  | "present"
  | "passeCompose"
  | "imparfait"
  | "futurSimple"
  | "conditionnel"
  | "subjonctif";

export const TENSES: { key: TenseKey; label: string; instruction: string }[] = [
  { key: "present", label: "présent", instruction: "présent" },
  { key: "passeCompose", label: "passé composé", instruction: "passé composé" },
  { key: "imparfait", label: "imparfait", instruction: "imparfait" },
  { key: "futurSimple", label: "futur simple", instruction: "futur simple" },
  { key: "conditionnel", label: "conditionnel présent", instruction: "conditionnel présent" },
  { key: "subjonctif", label: "subjonctif présent", instruction: "subjonctif présent" },
];

export const TENSE_KEYS: TenseKey[] = TENSES.map((t) => t.key);

/** Subject pronouns, indexed 0–5, matching the 6-form conjugation arrays. */
export const PERSONS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];

/**
 * Words that elide (drop their final vowel → apostrophe) when the next word
 * starts with a vowel or mute h. In our sentences the blank ("___") holds the
 * conjugated verb, so the elidable word is whatever directly precedes it —
 * most commonly the subject "je" (→ "j'") before a vowel-initial form.
 */
const ELIDABLE: Record<string, string> = {
  je: "j'", me: "m'", te: "t'", se: "s'", ce: "c'",
  le: "l'", la: "l'", ne: "n'", de: "d'", que: "qu'", jusque: "jusqu'",
};

/**
 * Whether `answer`'s first sound triggers elision. Vowels always do; we also
 * treat a leading "h" as mute (the common case for B1 verbs like habiter →
 * "j'habite"). Rare h-aspiré verbs are the accepted false-positive edge.
 */
function triggersElision(answer: string): boolean {
  const first = answer
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")[0]
    ?.toLowerCase();
  return !!first && "aeiouyh".includes(first);
}

/**
 * Fix elision at the blank boundary so the rendered sentence is spelled
 * correctly once the answer is filled in. E.g. the LLM (or the fallback
 * template) may emit "Je ___" for a passé-composé item whose answer is
 * "ai voyagé"; this rewrites it to "J'___" so it reads "J'ai voyagé".
 * A word already elided (e.g. "J'___") is left untouched.
 */
export function applyElisionBeforeBlank(sentence: string, answer: string): string {
  if (!answer || !triggersElision(answer)) return sentence;
  return sentence.replace(/([A-Za-zÀ-ÿ]+)(\s+)___/, (whole, word: string) => {
    const elided = ELIDABLE[word.toLowerCase()];
    if (!elided) return whole;
    const cased =
      word[0] === word[0].toUpperCase()
        ? elided[0].toUpperCase() + elided.slice(1)
        : elided;
    return `${cased}___`;
  });
}

/** A requested (verb, tense, subject) tuple, before the sentence is written. */
export interface VerbPick {
  infinitive: string;
  tense: TenseKey;
  person: number; // 0–5, index into PERSONS
}

/** One raw item as returned by the generation LLM (all fields untrusted). */
export interface RawGeneratedItem {
  n?: unknown;
  infinitive?: unknown;
  isVerb?: unknown;
  sentence?: unknown;
  answer?: unknown;
  english?: unknown;
}

/** A finished question ready for the client. */
export interface GrammarQuestion {
  infinitive: string;
  tenseKey: TenseKey;
  tenseLabel: string;
  person: string;
  sentence: string;
  answer: string;
  english: string;
}

/**
 * Pair the requested picks with the LLM's output and keep only well-formed,
 * verb-backed questions, up to `target`.
 *
 * Robustness against the two failure modes we've seen:
 *  - Alignment: items are matched by the echoed item number "n" (1-based),
 *    falling back to array position, so a reordered/short response can't
 *    silently pair a pick's infinitive with a different verb's sentence.
 *  - Non-verbs: a pick whose word isn't a real verb (e.g. the adjective
 *    "autoritaire") is dropped when the model flags `isVerb: false` — we never
 *    show it mislabeled. The DISPLAYED infinitive is the one the model actually
 *    conjugated, so the parenthetical can never disagree with the blank.
 */
export function assembleGrammarQuestions(
  picks: VerbPick[],
  generated: RawGeneratedItem[],
  target: number,
): GrammarQuestion[] {
  const tenseLabel = (k: TenseKey) => TENSES.find((t) => t.key === k)!.instruction;

  // Index the LLM output by echoed item number; fall back to array position.
  const byN = new Map<number, RawGeneratedItem>();
  generated.forEach((g, i) => {
    const n = typeof g?.n === "number" && Number.isFinite(g.n) ? g.n : i + 1;
    if (!byN.has(n)) byN.set(n, g);
  });

  const out: GrammarQuestion[] = [];
  for (let i = 0; i < picks.length && out.length < target; i++) {
    const p = picks[i];
    const g = byN.get(i + 1) ?? {};
    if (g.isVerb === false) continue; // model says it isn't a conjugable verb
    const answer = String(g.answer ?? "").trim();
    const sentence = String(g.sentence ?? "");
    if (!answer || !sentence.includes("___")) continue; // malformed → drop
    // Trust the model's own infinitive so the label matches the blank; if it
    // didn't echo one, fall back to what we requested.
    const infinitive = String(g.infinitive ?? "").trim().toLowerCase() || p.infinitive;
    out.push({
      infinitive,
      tenseKey: p.tense,
      tenseLabel: tenseLabel(p.tense),
      person: PERSONS[p.person],
      sentence: applyElisionBeforeBlank(sentence, answer),
      answer,
      english: String(g.english ?? "").trim(),
    });
  }
  return out;
}

/**
 * Curated bank of common B1-level French verbs (infinitives), covering the
 * regular -er/-ir/-re patterns plus the high-frequency irregulars a student
 * preparing for the B1 exam is expected to conjugate.
 */
export const B1_VERBS: string[] = [
  // High-frequency irregulars
  "être", "avoir", "aller", "faire", "dire", "pouvoir", "vouloir", "devoir",
  "savoir", "voir", "venir", "prendre", "mettre", "tenir", "falloir", "connaître",
  "partir", "sortir", "sentir", "dormir", "servir", "boire", "croire", "écrire",
  "lire", "vivre", "suivre", "recevoir", "devenir", "revenir", "tenir", "ouvrir",
  "offrir", "découvrir", "courir", "mourir", "naître", "conduire", "produire",
  "traduire", "rire", "plaire", "se souvenir", "s'asseoir",
  // Common regular -er
  "parler", "aimer", "habiter", "travailler", "manger", "regarder", "écouter",
  "chercher", "trouver", "penser", "demander", "donner", "montrer", "voyager",
  "acheter", "payer", "appeler", "commencer", "essayer", "envoyer", "préférer",
  "espérer", "jouer", "étudier", "oublier", "rencontrer", "raconter", "arriver",
  "rester", "passer", "porter", "entrer", "monter", "tomber",
  // Common regular -ir / -re
  "finir", "choisir", "réussir", "grandir", "réfléchir", "obéir", "remplir",
  "attendre", "entendre", "répondre", "perdre", "vendre", "descendre", "rendre",
  // Common pronominal
  "se lever", "se coucher", "se laver", "s'habiller", "se promener", "se reposer",
];
