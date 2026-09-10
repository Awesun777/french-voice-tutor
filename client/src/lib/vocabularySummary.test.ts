import { describe, expect, it } from "vitest";
import { summarizeVocabulary, vocabularyStage } from "./vocabularySummary";

describe("vocabulary summary", () => {
  it("counts every item once, combining review with learning", () => {
    const words = [{ sm2Status: "new" }, { sm2Status: "learning" }, { sm2Status: "review" }, { sm2Status: "mastered" }, { sm2Status: null }, {}] as const;
    const counts = summarizeVocabulary([...words]);
    expect(counts).toEqual({ total: 6, new: 3, learning: 2, mastered: 1 });
    expect(counts.new + counts.learning + counts.mastered).toBe(counts.total);
    expect(words[2].sm2Status).toBe("review");
  });
  it("keeps filtering consistent with the summary", () => {
    expect(vocabularyStage({ sm2Status: "review" })).toBe("learning");
    expect(vocabularyStage({ sm2Status: null })).toBe("new");
    expect(vocabularyStage({ sm2Status: "mastered" })).toBe("mastered");
  });
  it("supports empty libraries", () => {
    expect(summarizeVocabulary([])).toEqual({ total: 0, new: 0, learning: 0, mastered: 0 });
  });
});
