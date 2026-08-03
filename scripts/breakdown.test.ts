/**
 * Logic-tier checks for the sentence breakdown. The live counterpart
 * (breakdown.live.test.ts) checks the model produces sensible pieces; this
 * checks that a wrong piece never reaches a token.
 */
import { describe, it, expect } from "vitest";
import { wordsOf, renderBatch, validateParts, type BreakdownPart } from "./breakdown";

const part = (from: number, to: number, surface: string): BreakdownPart => ({
  from, to, surface, lemma: "x", gloss: "y",
});

describe("wordsOf", () => {
  it("numbers the words the model will be shown", () => {
    expect(wordsOf("Tu la suis peut-être")).toEqual(["Tu", "la", "suis", "peut-être"]);
    // Elisions stay whole, matching how buildTokens tokenises.
    expect(wordsOf("c'est l'invité")).toEqual(["c'est", "l'invité"]);
  });
});

describe("renderBatch", () => {
  it("gives each line a number and each word a number", () => {
    const out = renderBatch(["Tu la suis"]);
    expect(out).toContain("[1] Tu la suis");
    expect(out).toContain("1·Tu 2·la 3·suis");
  });

  it("collapses newlines so one line stays one line", () => {
    expect(renderBatch(["a\n  b"]).split("\n")[0]).toBe("[1] a b");
  });
});

describe("validateParts", () => {
  const words = ["je", "suis", "allé", "à", "la", "police"];

  it("keeps pieces that describe the words they point at", () => {
    const kept = validateParts(
      [part(1, 1, "je"), part(2, 3, "suis allé"), part(4, 4, "à")],
      words
    );
    expect(kept.map((p) => p.surface)).toEqual(["je", "suis allé", "à"]);
  });

  it("drops a piece whose surface does not match its indices", () => {
    // The failure mode that matters: confidently numbered, wrong words. Without
    // this check "police" would be labelled with the gloss meant for "allé".
    const kept = validateParts([part(1, 1, "je"), part(6, 6, "allé")], words);
    expect(kept.map((p) => p.surface)).toEqual(["je"]);
  });

  it("drops out-of-range and inverted ranges", () => {
    expect(validateParts([part(0, 1, "je")], words)).toEqual([]);
    expect(validateParts([part(1, 99, "je suis")], words)).toEqual([]);
    expect(validateParts([part(3, 2, "suis allé")], words)).toEqual([]);
  });

  it("drops a piece overlapping one already accepted", () => {
    const kept = validateParts([part(1, 2, "je suis"), part(2, 3, "suis allé")], words);
    expect(kept.map((p) => p.surface)).toEqual(["je suis"]);
  });

  it("ignores case and punctuation when matching surfaces", () => {
    expect(validateParts([part(1, 2, "Je  suis,")], words).length).toBe(1);
  });

  it("drops a piece that swallows a clause", () => {
    // Real output: "quand j'ai dit merci beaucoup" came back as one piece.
    const long = ["quand", "j'ai", "dit", "merci", "beaucoup"];
    expect(validateParts([part(1, 5, "quand j'ai dit merci beaucoup")], long)).toEqual([]);
    // Four words is still allowed — "je me suis dit" needs them.
    expect(validateParts([part(1, 4, "quand j'ai dit merci")], long).length).toBe(1);
  });

  it("accepts a partial cover — uncovered words fall back to per-word glosses", () => {
    const kept = validateParts([part(5, 6, "la police")], words);
    expect(kept.length).toBe(1);
  });
});
