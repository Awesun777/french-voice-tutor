import type { VocabEntry } from "@/types";

export type VocabularyStage = "new" | "learning" | "mastered";

// Review words are still being learned; retain their underlying SM-2 state.
export function vocabularyStage(word: Pick<VocabEntry, "sm2Status">): VocabularyStage {
  if (word.sm2Status === "mastered") return "mastered";
  if (word.sm2Status === "learning" || word.sm2Status === "review") return "learning";
  return "new";
}

export function summarizeVocabulary(words: Pick<VocabEntry, "sm2Status">[]) {
  const counts = { new: 0, learning: 0, mastered: 0 };
  for (const word of words) counts[vocabularyStage(word)]++;
  return { total: words.length, ...counts };
}
