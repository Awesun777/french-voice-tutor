import { describe, expect, it } from "vitest";
import { VERB_PREPOSITIONS, enforceVerbPreposition } from "./verbPrepositions";

const word = (over: Record<string, unknown>) => ({
  type: "word",
  found: true,
  word: "",
  baseForm: "",
  governedPreposition: "",
  prepositionExplanation: "",
  ...over,
});

describe("enforceVerbPreposition", () => {
  it("corrects a wrong cached preposition (the DeepSeek essayer→à bug)", () => {
    const r = enforceVerbPreposition(word({
      word: "essayer", baseForm: "essayer",
      governedPreposition: "à", prepositionExplanation: "wrong",
    })) as any;
    expect(r.governedPreposition).toBe("de");
    expect(r.prepositionExplanation).toContain("essayer DE");
  });

  it("fills the field when the cached entry left it empty", () => {
    const r = enforceVerbPreposition(word({ word: "décider", baseForm: "décider" })) as any;
    expect(r.governedPreposition).toBe("de");
    expect(r.prepositionExplanation).not.toBe("");
  });

  it("keys on the lemma (baseForm), case-insensitively", () => {
    const r = enforceVerbPreposition(word({ word: "Réussir", baseForm: "Réussir" })) as any;
    expect(r.governedPreposition).toBe("à");
  });

  it("handles reflexive lemmas", () => {
    const r = enforceVerbPreposition(word({ word: "se souvenir", baseForm: "se souvenir" })) as any;
    expect(r.governedPreposition).toBe("de");
  });

  it("flags direct-object traps with an empty preposition but an explanation", () => {
    const r = enforceVerbPreposition(word({
      word: "attendre", baseForm: "attendre",
      governedPreposition: "à", // wrong — must be cleared
    })) as any;
    expect(r.governedPreposition).toBe("");
    expect(r.prepositionExplanation).toContain("DIRECT object");
  });

  it("leaves unknown verbs and non-words untouched", () => {
    const verb = word({ word: "zigzaguer", baseForm: "zigzaguer", governedPreposition: "à", prepositionExplanation: "llm text" });
    expect((enforceVerbPreposition(verb) as any).governedPreposition).toBe("à");

    const phrase = { type: "phrase", found: true, phrase: "essayer de" };
    expect(enforceVerbPreposition(phrase)).toEqual(phrase);

    const notFound = word({ found: false, word: "essayer", baseForm: "essayer", governedPreposition: "" });
    expect((enforceVerbPreposition(notFound) as any).governedPreposition).toBe("");

    expect(enforceVerbPreposition(null)).toBeNull();
  });

  it("every table entry has a note, and de/à entries mention their preposition", () => {
    for (const [lemma, rule] of Object.entries(VERB_PREPOSITIONS)) {
      expect(rule.note.length, lemma).toBeGreaterThan(10);
      if (rule.prep === "de") expect(rule.note.toLowerCase(), lemma).toContain("de");
      if (rule.prep === "à") expect(rule.note.toLowerCase(), lemma).toContain("à");
    }
  });
});
