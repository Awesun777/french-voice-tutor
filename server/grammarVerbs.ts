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
