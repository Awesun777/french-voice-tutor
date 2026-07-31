/**
 * Detects when a user's spoken utterance is a goodbye that should end the voice
 * session (e.g. "Au revoir", "À bientôt"). Shared by both the Romain
 * (VoiceChatTab) and Anna (AnnaVoiceTab) conversation views.
 *
 * Matching is intentionally conservative to avoid ending a session mid-sentence:
 * we normalize away accents/punctuation and only treat SHORT utterances (a
 * closing remark, not a full sentence) that contain a goodbye phrase as an
 * end signal.
 */

// Normalized (accent- and punctuation-free) goodbye phrases.
const GOODBYE_TRIGGERS = [
  "au revoir",
  "a bientot",
  "a plus tard",
  "a plus",
  "a demain",
  "a tout a l heure",
  "a la prochaine",
  "adieu",
  "bonne nuit",
  "goodbye",
  "good bye",
  "bye bye",
  "bye",
];

/** Max words an utterance may have to still count as a closing remark. */
const MAX_WORDS = 5;

function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (accents)
    .toLowerCase()
    .replace(/['’`]/g, " ") // apostrophes -> space (l'heure -> l heure)
    .replace(/[^a-z\s]/g, " ") // drop punctuation/digits
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if `raw` is a short utterance that ends (or is) a goodbye.
 */
export function isGoodbye(raw: string): boolean {
  const norm = normalize(raw);
  if (!norm) return false;
  if (norm.split(" ").length > MAX_WORDS) return false;

  return GOODBYE_TRIGGERS.some(
    (t) =>
      norm === t ||
      norm.endsWith(" " + t) ||
      norm.startsWith(t + " ") ||
      norm.includes(" " + t + " ")
  );
}
