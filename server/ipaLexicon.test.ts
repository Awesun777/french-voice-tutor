import { describe, expect, it } from "vitest";
import { enforcePronunciation, ipaVariants, normalizeIpa } from "./ipaLexicon";

const word = (over: Record<string, unknown>) => ({
  type: "word", found: true, word: "", baseForm: "", pronunciation: "", ...over,
});

describe("normalizeIpa", () => {
  it("strips delimiters, dots, stress and spaces", () => {
    expect(normalizeIpa("/ɛ̃.pɔʁ.tɑ̃/")).toBe(normalizeIpa("ɛ̃ p ɔ ʁ t ɑ̃"));
    expect(normalizeIpa("[ˈe.se.je]")).toBe("eseje");
  });
  it("folds rhotic spellings and ascii g", () => {
    expect(normalizeIpa("səgɔ̃")).toBe("səɡɔ̃");
    expect(normalizeIpa("pɔʀte")).toBe(normalizeIpa("pɔʁte"));
  });
});

describe("enforcePronunciation", () => {
  it("corrects the essayer cache bug (missing syllable)", () => {
    const r = enforcePronunciation(word({ word: "essayer", baseForm: "essayer", pronunciation: "ɛs.je" })) as any;
    expect(normalizeIpa(r.pronunciation)).toBe("eseje");
  });

  it("keeps LLM formatting when it matches an attested variant", () => {
    const r = enforcePronunciation(word({ word: "important", baseForm: "important", pronunciation: "/ɛ̃.pɔʁ.tɑ̃/" })) as any;
    expect(r.pronunciation).toBe("/ɛ̃.pɔʁ.tɑ̃/");
  });

  it("keeps genuine variants rather than 'correcting' them (monsieur)", () => {
    const r = enforcePronunciation(word({ word: "monsieur", baseForm: "monsieur", pronunciation: "/mə.sjø/" })) as any;
    expect(r.pronunciation).toBe("/mə.sjø/");
  });

  it("fills an empty pronunciation from the lexicon", () => {
    const r = enforcePronunciation(word({ word: "oiseau", baseForm: "oiseau" })) as any;
    expect(normalizeIpa(r.pronunciation)).toBe("wazo");
  });

  it("leaves out-of-lexicon words and non-words untouched", () => {
    const r = enforcePronunciation(word({ word: "zorglub", baseForm: "zorglub", pronunciation: "zɔʁɡlyb" })) as any;
    expect(r.pronunciation).toBe("zɔʁɡlyb");
    const phrase = { type: "phrase", found: true, pronunciation: "x" };
    expect(enforcePronunciation(phrase)).toEqual(phrase);
    expect(enforcePronunciation(null)).toBeNull();
  });

  it("keys on the lemma, case-insensitively, with accents", () => {
    expect(ipaVariants("Été")).toBeTruthy();
    expect(ipaVariants("réussir")).toBeTruthy();
  });
});
