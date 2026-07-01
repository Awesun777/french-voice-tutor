import { describe, it, expect } from "vitest";
import { B1_VERBS, TENSES, TENSE_KEYS, PERSONS } from "./grammarVerbs";

describe("grammar verb bank + tense config", () => {
  it("exposes all six testable tenses with labels", () => {
    expect(TENSE_KEYS).toEqual(["present", "passeCompose", "imparfait", "futurSimple", "conditionnel", "subjonctif"]);
    expect(TENSES.find((t) => t.key === "passeCompose")?.instruction).toBe("passé composé");
    expect(TENSES.find((t) => t.key === "conditionnel")?.instruction).toBe("conditionnel présent");
  });

  it("has six subject persons matching the 6-form conjugation arrays", () => {
    expect(PERSONS).toHaveLength(6);
    expect(PERSONS[0]).toBe("je");
    expect(PERSONS[5]).toBe("ils/elles");
  });

  it("provides a deduped B1 verb bank of infinitives", () => {
    expect(B1_VERBS.length).toBeGreaterThan(40);
    // every entry looks like an infinitive (…er/ir/re/oir), incl. pronominals
    for (const v of B1_VERBS) {
      expect(/(?:er|ir|re|oir)$/i.test(v)).toBe(true);
    }
    // covers core irregulars a B1 student must know
    for (const v of ["être", "avoir", "aller", "faire", "voyager"]) {
      expect(B1_VERBS).toContain(v);
    }
  });
});

// Grading parity: the client grades with this same normalization.
describe("answer normalization (accent/case insensitive)", () => {
  const normalize = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

  it("accepts missing accents and case differences", () => {
    expect(normalize("Voyagerais")).toBe(normalize("voyagerais"));
    expect(normalize("etudie")).toBe(normalize("étudie"));
    expect(normalize("ai  voyagé")).toBe(normalize("ai voyage"));
    expect(normalize("me suis levé")).toBe(normalize("me suis leve"));
  });

  it("still rejects a genuinely wrong form", () => {
    expect(normalize("voyage")).not.toBe(normalize("voyagerais"));
  });
});
