/**
 * Live check that the ARTICLE glosser disambiguates homographs by context,
 * mirroring gloss.live.test.ts for video. Run with `pnpm test:live`.
 */
import { describe, it, expect } from "vitest";
import { glossBatch } from "./ingest-article";

describe("article glossBatch homograph disambiguation", () => {
  it(
    "separates the two readings of a homograph across blocks",
    async () => {
      const blocks = [
        "Le journaliste est resté prudent : je suis convaincu que la situation va changer.",
        "Chaque matin, il quitte la maison et sa fille le suis jusqu'à la porte du jardin.",
      ];
      const out = await glossBatch(blocks);
      console.log("contextual entries:", JSON.stringify(out.contextual, null, 2));

      const suisEntries = out.contextual.filter(
        (c) => c.surface.toLowerCase().replace(/[^a-zà-ÿœæ]/g, "") === "suis"
      );
      expect(suisEntries.length).toBeGreaterThan(0);

      // The block-2 reading must be suivre, not être.
      const b2 = suisEntries.filter((c) => c.cue === 2);
      expect(b2.length).toBeGreaterThan(0);
      expect(b2[0].lemma.toLowerCase()).toContain("suivre");
      expect(b2[0].gloss.toLowerCase()).toMatch(/follow/);
    },
    60_000
  );
});
