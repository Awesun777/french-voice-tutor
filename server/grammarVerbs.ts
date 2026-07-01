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
