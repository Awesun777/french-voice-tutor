/**
 * Shared homograph handling for the video and article ingesters.
 *
 * Both glossers ask the model for one gloss per DISTINCT word across a whole
 * batch, then key the answers by surface form. That structurally cannot express
 * a word that means different things in different places, so the most frequent
 * reading wins everywhere: "suis" in "tu la suis" (suivre, "follow") inherited
 * the gloss from "je suis" (être, "am").
 *
 * The fix is per-occurrence overrides, and this module is the part both scripts
 * share: which forms are ambiguous, and the prompt text that demands they be
 * disambiguated.
 */

/** Same French-aware matcher both ingesters use. */
const WORD_RE = /[A-Za-zÀ-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÿŒœÆæ]+)*/g;

/**
 * French surface forms that map to more than one lemma. The model will not
 * reliably volunteer that a word is ambiguous, so any of these appearing in a
 * batch are named explicitly in the prompt and required to come back as
 * per-occurrence entries.
 *
 * Only forms whose readings are genuinely different WORDS belong here — not
 * mere tense ambiguity within one verb, which would gloss the same way anyway.
 * Values are the competing lemmas, purely as a hint to the model.
 */
export const HOMOGRAPHS: Record<string, string[]> = {
  // The one that started this: "je suis" (am) vs "tu la suis" (follow).
  suis: ["être", "suivre"],
  suit: ["suivre", "suite"],
  suivant: ["suivre (following)", "suivant (next)"],
  est: ["être", "est (east)"],
  a: ["avoir", "à (to)"],
  as: ["avoir", "as (ace)"],
  sommes: ["être", "somme (sums)"],
  somme: ["somme (sum)", "somme (nap)"],
  été: ["être (been)", "été (summer)"],
  fils: ["fils (son)", "fil (threads)"],
  livre: ["livre (book)", "livre (pound)", "livrer (delivers)"],
  livres: ["livre (book)", "livre (pound)"],
  porte: ["porte (door)", "porter (carries/wears)"],
  portes: ["porte (door)", "porter (carry/wear)"],
  pas: ["pas (negation)", "pas (step)"],
  plus: ["plus (more)", "plus (no longer)"],
  vers: ["vers (towards)", "ver (worms)", "vers (verse)"],
  tour: ["tour (turn)", "tour (tower)"],
  mode: ["mode (fashion)", "mode (method)"],
  vis: ["vivre", "voir", "vis (screw)"],
  vit: ["vivre (lives)", "voir (saw)"],
  vole: ["voler (flies)", "voler (steals)"],
  volé: ["voler (flown)", "voler (stolen)"],
  parti: ["partir (left)", "parti (political party)"],
  partie: ["partie (part)", "partir (left, fem.)"],
  pouvoir: ["pouvoir (to be able)", "pouvoir (power)"],
  savoir: ["savoir (to know)", "savoir (knowledge)"],
  cours: ["cours (class)", "courir (run)"],
  court: ["court (short)", "courir (runs)"],
  sens: ["sens (meaning/sense)", "sentir (feel)"],
  car: ["car (because)", "car (coach/bus)"],
  or: ["or (gold)", "or (now/yet)"],
  son: ["son (his/her)", "son (sound)"],
  temps: ["temps (time)", "temps (weather)"],
  fait: ["faire (does/done)", "fait (fact)"],
};

/** Homograph surfaces present in this text, for the prompt's "disambiguate these" list. */
export function homographsIn(text: string): string[] {
  const present = new Set<string>();
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0].toLowerCase();
    if (HOMOGRAPHS[w]) present.add(w);
    // WORD_RE keeps hyphenated and elided forms whole, so "suis-moi" and
    // "est-ce" arrive as single tokens. Check the parts too, or the imperative
    // "Suis-moi !" ("follow me") never gets flagged as ambiguous at all.
    if (/['’-]/.test(w)) {
      for (const part of w.split(/['’-]/)) {
        if (HOMOGRAPHS[part]) present.add(part);
      }
    }
  }
  return [...present];
}

/**
 * The prompt fragment naming this batch's ambiguous forms. Empty string when
 * the batch has none, so it costs nothing on ordinary text.
 *
 * `unit` is what the numbered lines are called in the surrounding prompt —
 * "cue" for video, "block" for articles.
 */
export function ambiguousNote(text: string, unit: string): string {
  const ambiguous = homographsIn(text);
  if (!ambiguous.length) return "";
  const list = ambiguous
    .map((w) => `"${w}" (could be ${HOMOGRAPHS[w].join(" or ")})`)
    .join("; ");
  return (
    `\n\nAMBIGUOUS FORMS PRESENT: ${list}. ` +
    `For EVERY occurrence of each of these, emit a "contextual" entry naming the ` +
    `${unit} it appears in — even if all occurrences turn out to mean the same thing. ` +
    `Read the surrounding words to decide: in "tu la suis" the object pronoun "la" ` +
    `makes "suis" the verb suivre ("follow"), while in "je suis fatigué" it is être ("am").`
  );
}

/**
 * Direct-object clitics. "être" never takes one, so anything following them is
 * a transitive verb — that is what makes "je la suis" decidable.
 */
const DIRECT_OBJECT_CLITICS = new Set(["le", "la", "les", "l'", "l’"]);
/** Clitics that may sit between a subject pronoun and its verb. */
const INTERVENING_CLITICS = new Set([
  "le", "la", "les", "l'", "l’", "me", "m'", "m’", "te", "t'", "t’",
  "nous", "vous", "y", "en", "ne", "n'", "n’",
]);

/**
 * Readings that French grammar settles outright, applied after the model has
 * spoken because the model demonstrably gets them wrong: asked to disambiguate
 * a real transcript it glossed "Tu la suis" as être ("am"), and pointed several
 * of its other answers at cue numbers that did not exist.
 *
 * Only rules with no counterexample belong here.
 *
 * `prevWords` are the lowercased words before this one in the same cue/block,
 * in order. Returns null when nothing is decidable.
 */
export function decisiveGloss(
  surface: string,
  prevWords: string[]
): { lemma: string; gloss: string } | null {
  const w = surface.toLowerCase();

  if (w === "suis") {
    const prev = prevWords[prevWords.length - 1];
    // "je la suis", "tu les suis" — être takes no direct object, so this is
    // suivre. Note the reflexive "je me suis dit" is NOT caught here: "me" is
    // not a direct-object clitic in that construction's slot, and it really is
    // être.
    if (prev && DIRECT_OBJECT_CLITICS.has(prev)) {
      return { lemma: "suivre", gloss: "follow" };
    }
    // "tu suis", "tu me suis" — être in the 2nd person singular is "tu es",
    // never "tu suis", so a "tu" subject makes this suivre unconditionally.
    for (let i = prevWords.length - 1, hops = 0; i >= 0 && hops < 3; i--, hops++) {
      const p = prevWords[i];
      if (p === "tu") return { lemma: "suivre", gloss: "follow" };
      if (!INTERVENING_CLITICS.has(p)) break;
    }
  }

  return null;
}

/** JSON-schema fragment for the per-occurrence overrides. Identical in both ingesters. */
export const CONTEXTUAL_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      cue: { type: "integer" },
      surface: { type: "string" },
      lemma: { type: "string" },
      gloss: { type: "string" },
    },
    required: ["cue", "surface", "lemma", "gloss"],
    additionalProperties: false,
  },
} as const;

/** Per-occurrence override. `cue` is the 1-based numbered line within the batch. */
export interface ContextualGloss {
  cue: number;
  surface: string;
  lemma: string;
  gloss: string;
}

/**
 * Bucket contextual entries by their 1-based line number, dropping anything
 * pointing outside the batch.
 */
export function bucketContextual(
  contextual: ContextualGloss[] | undefined,
  lineCount: number
): Map<number, Map<string, { lemma: string; gloss: string }>> {
  const byLine = new Map<number, Map<string, { lemma: string; gloss: string }>>();
  for (const c of contextual ?? []) {
    if (!Number.isInteger(c.cue) || c.cue < 1 || c.cue > lineCount) continue;
    if (!byLine.has(c.cue)) byLine.set(c.cue, new Map());
    byLine.get(c.cue)!.set(c.surface.toLowerCase(), { lemma: c.lemma, gloss: c.gloss });
  }
  return byLine;
}
