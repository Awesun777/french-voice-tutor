/**
 * Curated French IPA from WikiPron (CUNY-CL/wikipron, mined from Wiktionary,
 * CC BY-SA), applied on read like `enforceVerbPreposition`.
 *
 * The dictionary LLM writes the displayed `pronunciation` field and is
 * usually right on common words — but wrong without warning (the cache
 * shipped /ɛs.je/ for "essayer", a whole syllable short). Policy here is
 * REPLACE ONLY ON REAL MISMATCH: if the LLM's IPA matches any attested
 * WikiPron variant after normalization, keep it — it carries nicer
 * syllable-dot formatting than the raw lexicon, and genuine variants
 * (monsieur /mə.sjø/ ~ /mɔ.sjø/) shouldn't be "corrected" to each other.
 *
 * `server/data/ipaLexiconFr.json` is generated from fra_latn_broad.tsv:
 * keys lowercased+NFC, values = attested variants with phonemes joined.
 * Imported statically so esbuild bundles it — no runtime file paths to
 * break in the Railway image (see the import.meta.dirname outage).
 */
import lexicon from "./data/ipaLexiconFr.json";

const LEXICON = lexicon as Record<string, string[]>;

/**
 * Normalize an IPA string for comparison: strip delimiters (/ [ ]),
 * syllable dots, stress marks, ties and spaces; fold the ASCII/latin
 * lookalikes (g→ɡ) and the French rhotic spellings (r, ʀ → ʁ) that models
 * write interchangeably. NFC first so precomposed vs combining accents
 * (ɛ̃) compare equal.
 */
export function normalizeIpa(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[/[\]().ˈˌːˑ‿͡\s]/g, "")
    .replace(/g/g, "ɡ")
    .replace(/[rʀ]/g, "ʁ");
}

/** Attested IPA variants for a French word (lowercased lookup), or null. */
export function ipaVariants(word: string): string[] | null {
  return LEXICON[word.trim().toLowerCase().normalize("NFC")] ?? null;
}

/**
 * Force a curated pronunciation onto a dictionary word result when the
 * LLM's value doesn't match any attested variant. Idempotent; applied to
 * freshly-generated AND cached results so bad cache entries correct on
 * read. Words outside the lexicon keep whatever the model produced.
 */
export function enforcePronunciation<T>(result: T): T {
  const r = result as any;
  if (!r || typeof r !== "object" || r.type !== "word" || r.found === false) return result;
  const lemma = String(r.baseForm || r.word || "").trim();
  if (!lemma) return result;
  const variants = ipaVariants(lemma);
  if (!variants?.length) return result;
  const current = normalizeIpa(String(r.pronunciation ?? ""));
  if (current && variants.some((v) => normalizeIpa(v) === current)) return result;
  r.pronunciation = variants[0];
  return result;
}
