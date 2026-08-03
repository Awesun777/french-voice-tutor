/**
 * Logic-tier checks for the video glosser's homograph handling. No API calls —
 * the live counterpart (gloss.live.test.ts) checks that the model actually
 * disambiguates; this checks that a contextual entry, once returned, reaches
 * the token.
 */
import { describe, it, expect } from "vitest";
import { buildTokens } from "./ingest-video";
import { homographsIn, HOMOGRAPHS, bucketContextual } from "./homographs";

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
