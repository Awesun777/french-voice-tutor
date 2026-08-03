/**
 * Live check that the glosser disambiguates homographs by context.
 * Run with `pnpm test:live` (railway run supplies OPENAI_API_KEY).
 *
 * The regression this pins: "suis" in "tu la suis" was glossed "be" because a
 * single batch-wide entry per surface form meant the frequent être reading won
 * everywhere in the excerpt.
 */
import { describe, it, expect } from "vitest";
import { glossBatch } from "./ingest-video";

describe("glossBatch homograph disambiguation", () => {
  it(
    "reads suis as suivre after an object pronoun and as être before an adjective",
    async () => {
      const cues = [
        "Je suis vraiment fatigué ce soir.",
        "Elle marche devant et tu la suis sans rien dire.",
      ];
      const out = await glossBatch(cues);

      const forCue = (n: number) =>
        out.contextual.filter(
          (c) => c.cue === n && c.surface.toLowerCase().replace(/[^a-zà-ÿœæ]/g, "") === "suis"
        );

      console.log("contextual entries:", JSON.stringify(out.contextual, null, 2));

      const following = forCue(2);
      expect(following.length).toBeGreaterThan(0);
      expect(following[0].lemma.toLowerCase()).toContain("suivre");
      expect(following[0].gloss.toLowerCase()).toMatch(/follow/);

      const being = forCue(1);
      expect(being.length).toBeGreaterThan(0);
      expect(being[0].lemma.toLowerCase()).toContain("être");
      expect(being[0].gloss.toLowerCase()).toMatch(/\b(am|be)\b/);
    },
    60_000
  );
});
