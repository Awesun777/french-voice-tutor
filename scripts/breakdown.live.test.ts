/**
 * Live check that the sentence breakdown produces what per-word glossing could
 * not. Run with `pnpm test:live`.
 *
 * Both assertions are the exact failures that motivated this: "la" glossed as
 * the article "the" when it is a direct object, and "suis allé" split into
 * "am" + "gone" when it means "went".
 */
import { describe, it, expect } from "vitest";
import { breakdownBatch } from "./ingest-video";
import { validateParts, wordsOf } from "./breakdown";

describe("sentence breakdown", () => {
  it(
    "reads clitics as pronouns and groups compound tenses",
    async () => {
      const cues = [
        "L'invité de l'épisode d'aujourd'hui, c'est Erika. Tu la suis peut-être.",
        "Après, je suis allé à la police.",
      ];
      const out = await breakdownBatch(cues);
      const byLine = new Map(out.lines.map((l) => [l.line, l]));

      for (const n of [1, 2]) {
        const line = byLine.get(n);
        expect(line, `no breakdown for line ${n}`).toBeTruthy();
        const kept = validateParts(line!.parts ?? [], wordsOf(cues[n - 1]));
        console.log(`\n[${n}] ${cues[n - 1]}`);
        console.log(`  EN: ${line!.en}`);
        for (const p of kept) console.log(`    ${p.surface}  →  ${p.gloss}  (${p.lemma})`);
        // Every part the model returned should survive validation; a drop means
        // it misnumbered something.
        expect(kept.length).toBe((line!.parts ?? []).length);
      }

      // "la" is her, not "the".
      const l1 = validateParts(byLine.get(1)!.parts ?? [], wordsOf(cues[0]));
      const la = l1.find((p) => p.surface.toLowerCase() === "la");
      expect(la?.gloss.toLowerCase()).toMatch(/her/);

      // "suis allé" is one piece meaning went.
      const l2 = validateParts(byLine.get(2)!.parts ?? [], wordsOf(cues[1]));
      const went = l2.find((p) => /suis\s+allé/i.test(p.surface));
      expect(went, "suis allé was not grouped").toBeTruthy();
      expect(went!.gloss.toLowerCase()).toMatch(/went|did go/);

      // And the whole line reads as English.
      expect(byLine.get(2)!.en.toLowerCase()).toMatch(/went to the police/);
    },
    90_000
  );
});
