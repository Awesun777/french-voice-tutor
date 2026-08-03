/**
 * Logic-tier checks for the video glosser's homograph handling. No API calls —
 * the live counterpart (gloss.live.test.ts) checks that the model actually
 * disambiguates; this checks that a contextual entry, once returned, reaches
 * the token.
 */
import { describe, it, expect } from "vitest";
import { buildTokens } from "./ingest-video";
import { homographsIn, HOMOGRAPHS, bucketContextual, decisiveGloss } from "./homographs";

describe("homographsIn", () => {
  it("finds ambiguous forms so the prompt can name them", () => {
    expect(homographsIn("Tu la suis dans la rue")).toContain("suis");
    // Case and accents shouldn't hide a form.
    expect(homographsIn("SUIS-moi")).toContain("suis");
    // A sentence with nothing ambiguous produces no noise.
    expect(homographsIn("Bonjour, comment vas-tu ?")).toEqual([]);
  });

  it("lists competing lemmas for the form that started this", () => {
    expect(HOMOGRAPHS["suis"]).toEqual(["être", "suivre"]);
  });
});

describe("buildTokens contextual override", () => {
  const batchWide = new Map([["suis", { lemma: "être", gloss: "am" }]]);

  it("prefers the cue-specific reading over the batch-wide one", () => {
    const tokens = buildTokens(
      "Tu la suis",
      batchWide,
      [],
      [],
      0,
      new Map([["suis", { lemma: "suivre", gloss: "follow" }]])
    );
    const suis = tokens.find((t) => t.surface.toLowerCase() === "suis");
    expect(suis?.gloss).toBe("follow");
    expect(suis?.lemma).toBe("suivre");
  });

  it("falls back to the batch-wide gloss when the cue has no override", () => {
    const tokens = buildTokens("Je suis fatigué", batchWide, [], [], 0, undefined);
    const suis = tokens.find((t) => t.surface.toLowerCase() === "suis");
    expect(suis?.gloss).toBe("am");
    expect(suis?.lemma).toBe("être");
  });

  it("leaves other words on the batch-wide map", () => {
    const wide = new Map([
      ["suis", { lemma: "être", gloss: "am" }],
      ["rue", { lemma: "rue", gloss: "street" }],
    ]);
    const tokens = buildTokens(
      "Tu la suis rue",
      wide,
      [],
      [],
      0,
      new Map([["suis", { lemma: "suivre", gloss: "follow" }]])
    );
    expect(tokens.find((t) => t.surface === "rue")?.gloss).toBe("street");
    expect(tokens.find((t) => t.surface === "suis")?.gloss).toBe("follow");
  });
});

describe("decisiveGloss", () => {
  const follow = { lemma: "suivre", gloss: "follow" };

  it("reads suis as suivre after a direct-object clitic", () => {
    // The reported bug, verbatim.
    expect(decisiveGloss("suis", ["tu", "la"])).toEqual(follow);
    expect(decisiveGloss("suis", ["je", "la"])).toEqual(follow);
    expect(decisiveGloss("suis", ["je", "les"])).toEqual(follow);
  });

  it("reads suis as suivre whenever the subject is tu", () => {
    // être in the 2nd person is "tu es", so "tu suis" can only be suivre.
    expect(decisiveGloss("suis", ["tu"])).toEqual(follow);
    expect(decisiveGloss("suis", ["tu", "me"])).toEqual(follow);
    expect(decisiveGloss("suis", ["tu", "ne", "me"])).toEqual(follow);
  });

  it("leaves the genuinely ambiguous and the reflexive alone", () => {
    // "je suis" really is either verb — the model must decide, not this table.
    expect(decisiveGloss("suis", ["je"])).toBeNull();
    // "je me suis dit" is être; a rule that broke this would be worse than none.
    expect(decisiveGloss("suis", ["je", "me"])).toBeNull();
    expect(decisiveGloss("suis", ["moi", "je"])).toBeNull();
    // Unrelated words are never touched.
    expect(decisiveGloss("porte", ["la"])).toBeNull();
  });

  it("does not reach past an intervening non-clitic to find tu", () => {
    expect(decisiveGloss("suis", ["tu", "vois", "je"])).toBeNull();
  });
});

describe("bucketContextual", () => {
  it("drops entries pointing outside the batch", () => {
    // The real model returned cue 26 and 33 for a 25-cue batch.
    const bucketed = bucketContextual(
      [
        { cue: 1, surface: "suis", lemma: "être", gloss: "am" },
        { cue: 33, surface: "suis", lemma: "être", gloss: "am" },
        { cue: 0, surface: "x", lemma: "y", gloss: "z" },
      ],
      25
    );
    expect(bucketed.has(1)).toBe(true);
    expect(bucketed.has(33)).toBe(false);
    expect(bucketed.has(0)).toBe(false);
  });
});
