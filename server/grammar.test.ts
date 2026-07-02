import { describe, it, expect } from "vitest";
import {
  B1_VERBS, TENSES, TENSE_KEYS, PERSONS, applyElisionBeforeBlank,
  assembleGrammarQuestions, sentenceHasContext, type VerbPick, type RawGeneratedItem,
} from "./grammarVerbs";

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

describe("elision at the blank boundary", () => {
  it("contracts 'Je ___' when the answer starts with a vowel (passé composé)", () => {
    expect(applyElisionBeforeBlank("Je ___ partout dans le monde.", "ai voyagé"))
      .toBe("J'___ partout dans le monde.");
  });

  it("handles present-tense vowel starts (j'aime, j'étudie)", () => {
    expect(applyElisionBeforeBlank("Je ___ le café.", "aime")).toBe("J'___ le café.");
    expect(applyElisionBeforeBlank("Je ___ le français.", "étudie")).toBe("J'___ le français.");
  });

  it("treats a leading mute h as a vowel (j'habite)", () => {
    expect(applyElisionBeforeBlank("Je ___ à Paris.", "habite")).toBe("J'___ à Paris.");
  });

  it("preserves lowercase 'je' mid-sentence", () => {
    expect(applyElisionBeforeBlank("Hier, je ___ malade.", "étais")).toBe("Hier, j'___ malade.");
  });

  it("does NOT elide when the answer starts with a consonant", () => {
    // pronominal passé composé: "je" + "me suis levé" keeps the space
    expect(applyElisionBeforeBlank("Je ___ tôt ce matin.", "me suis levé"))
      .toBe("Je ___ tôt ce matin.");
    expect(applyElisionBeforeBlank("Je ___ le bus.", "prends")).toBe("Je ___ le bus.");
  });

  it("leaves an already-elided sentence untouched", () => {
    expect(applyElisionBeforeBlank("J'___ voyagé.", "ai")).toBe("J'___ voyagé.");
  });

  it("elides other pronouns before the blank (tu te → t')", () => {
    expect(applyElisionBeforeBlank("Tu ne ___ jamais.", "arrêtes")).toBe("Tu n'___ jamais.");
    expect(applyElisionBeforeBlank("Il ne ___ pas.", "est")).toBe("Il n'___ pas.");
  });
});

describe("assembleGrammarQuestions — pairing + vetting", () => {
  const pick = (infinitive: string, tense: VerbPick["tense"], person: number): VerbPick =>
    ({ infinitive, tense, person });

  it("pairs picks with generated items by echoed item number", () => {
    const picks = [pick("parler", "present", 1), pick("finir", "present", 5)];
    const generated: RawGeneratedItem[] = [
      { n: 1, infinitive: "parler", isVerb: true, sentence: "Tu ___ trop vite.", answer: "parles", english: "You speak too fast." },
      { n: 2, infinitive: "finir", isVerb: true, sentence: "Ils ___ le travail.", answer: "finissent", english: "They finish the work." },
    ];
    const out = assembleGrammarQuestions(picks, generated, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ infinitive: "parler", answer: "parles", person: "tu" });
    expect(out[1]).toMatchObject({ infinitive: "finir", answer: "finissent", person: "ils/elles" });
  });

  it("realigns a response returned out of order using n", () => {
    const picks = [pick("parler", "present", 1), pick("finir", "present", 5)];
    const generated: RawGeneratedItem[] = [
      { n: 2, infinitive: "finir", isVerb: true, sentence: "Ils ___ le travail.", answer: "finissent" },
      { n: 1, infinitive: "parler", isVerb: true, sentence: "Tu ___ trop vite.", answer: "parles" },
    ];
    const out = assembleGrammarQuestions(picks, generated, 2);
    // pick[0] (parler) must get parler's sentence, not finir's
    expect(out[0].infinitive).toBe("parler");
    expect(out[0].answer).toBe("parles");
  });

  it("drops a non-verb (isVerb:false) and backfills from the buffer to hit target", () => {
    // The reported bug: "autoritaire" isn't a verb.
    const picks = [
      pick("autoritaire", "present", 4), // buffer/junk — should be dropped
      pick("parler", "present", 1),
      pick("finir", "present", 5),
    ];
    const generated: RawGeneratedItem[] = [
      { n: 1, infinitive: "autoritaire", isVerb: false, sentence: "", answer: "" },
      { n: 2, infinitive: "parler", isVerb: true, sentence: "Tu ___ trop vite.", answer: "parles" },
      { n: 3, infinitive: "finir", isVerb: true, sentence: "Ils ___ le travail.", answer: "finissent" },
    ];
    const out = assembleGrammarQuestions(picks, generated, 2);
    expect(out).toHaveLength(2);
    expect(out.map((q) => q.infinitive)).toEqual(["parler", "finir"]);
    expect(out.some((q) => q.infinitive === "autoritaire")).toBe(false);
  });

  it("displays the model's own infinitive so the label always matches the blank", () => {
    // Model corrected a typo'd pick to the real verb it conjugated.
    const picks = [pick("voayger", "passeCompose", 0)];
    const generated: RawGeneratedItem[] = [
      { n: 1, infinitive: "voyager", isVerb: true, sentence: "Je ___ partout.", answer: "ai voyagé" },
    ];
    const out = assembleGrammarQuestions(picks, generated, 1);
    expect(out[0].infinitive).toBe("voyager");
    // and elision is applied at the blank
    expect(out[0].sentence).toBe("J'___ partout.");
  });

  it("drops malformed items (no blank or empty answer)", () => {
    const picks = [pick("parler", "present", 1), pick("finir", "present", 5)];
    const generated: RawGeneratedItem[] = [
      { n: 1, infinitive: "parler", isVerb: true, sentence: "Tu parles trop vite.", answer: "parles" }, // no ___
      { n: 2, infinitive: "finir", isVerb: true, sentence: "Ils ___ le travail.", answer: "" },          // empty answer
    ];
    expect(assembleGrammarQuestions(picks, generated, 2)).toHaveLength(0);
  });

  it("never returns more than the requested target", () => {
    const picks = [
      pick("parler", "present", 0), pick("finir", "present", 0), pick("vendre", "present", 0),
    ];
    const generated: RawGeneratedItem[] = picks.map((p, i) => ({
      n: i + 1, infinitive: p.infinitive, isVerb: true, sentence: "Je ___ ici.", answer: "fais",
    }));
    expect(assembleGrammarQuestions(picks, generated, 2)).toHaveLength(2);
  });

  it("defaults isVerb to true when the model omits it (back-compat)", () => {
    const picks = [pick("parler", "present", 1)];
    const generated: RawGeneratedItem[] = [
      { n: 1, infinitive: "parler", sentence: "Tu ___ trop vite.", answer: "parles" },
    ];
    expect(assembleGrammarQuestions(picks, generated, 1)).toHaveLength(1);
  });

  it("drops bare 'subject ___' sentences that lack context", () => {
    const picks = [pick("parler", "present", 4), pick("finir", "present", 5)];
    const generated: RawGeneratedItem[] = [
      { n: 1, infinitive: "parler", isVerb: true, sentence: "Vous ___.", answer: "parlez" },        // bare → drop
      { n: 2, infinitive: "finir", isVerb: true, sentence: "Ils ___ toujours à l'heure.", answer: "finissent" },
    ];
    const out = assembleGrammarQuestions(picks, generated, 2);
    expect(out).toHaveLength(1);
    expect(out[0].infinitive).toBe("finir");
  });
});

describe("sentenceHasContext", () => {
  it("rejects bare subject + blank skeletons", () => {
    expect(sentenceHasContext("Vous ___.")).toBe(false);
    expect(sentenceHasContext("Je ___.")).toBe(false);
    expect(sentenceHasContext("Ils ___ !")).toBe(false);
  });
  it("accepts full contextual sentences", () => {
    expect(sentenceHasContext("L'été dernier, j'___ en Italie.")).toBe(true);
    expect(sentenceHasContext("Tu ___ le bus tous les matins.")).toBe(true);
    expect(sentenceHasContext("Ils ___ toujours à l'heure.")).toBe(true);
  });
});
