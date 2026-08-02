import { describe, it, expect } from "vitest";
import { contentWords, candidateUpdate, MAX_CANDIDATES, REPAIR_INSTRUCTION } from "./wordRepair";

describe("contentWords", () => {
  it("keeps content words and drops function words", () => {
    const words = contentWords("Je suis allée au marché avec ma sœur ce matin.");
    expect(words).toContain("allée");
    expect(words).toContain("marché");
    expect(words).toContain("sœur");
    expect(words).toContain("matin");
    // Function words a learner never asks about.
    expect(words).not.toContain("Je");
    expect(words).not.toContain("avec");
    expect(words).not.toContain("ce");
  });

  it("preserves accents, so the candidate matches what she actually said", () => {
    expect(contentWords("La grenouille nageait près de l'étang.")).toEqual(
      expect.arrayContaining(["grenouille", "nageait", "étang"])
    );
  });

  it("strips a leading elided article — the student asks about the noun", () => {
    expect(contentWords("Regarde l'étang et l'oiseau.")).toEqual(
      expect.arrayContaining(["étang", "oiseau"])
    );
  });

  it("keeps oe and ae ligatures whole", () => {
    // These sit outside the À-ÿ range; a naive class splits "sœur" into s + ur.
    expect(contentWords("Ma sœur a bon cœur.")).toEqual(
      expect.arrayContaining(["sœur", "cœur"])
    );
  });

  it("keeps elisions and hyphenated words whole", () => {
    const words = contentWords("Peux-tu répéter, s'il te plaît ? C'est un rendez-vous.");
    expect(words).toContain("Peux-tu");
    expect(words).toContain("rendez-vous");
  });

  it("drops words of two letters or fewer", () => {
    // Two-letter tokens are almost all function words and match far too many
    // things by sound to be useful candidates.
    expect(contentWords("Il y a du pain")).not.toContain("du");
    expect(contentWords("Il y a du pain")).toContain("pain");
  });

  it("deduplicates case-insensitively, keeping first appearance", () => {
    expect(contentWords("Chien chien CHIEN gentil")).toEqual(["Chien", "gentil"]);
  });

  it("returns an empty list for a turn with nothing worth offering", () => {
    expect(contentWords("Oui, et toi ?")).toEqual([]);
    expect(contentWords("")).toEqual([]);
  });
});

describe("candidateUpdate", () => {
  it("returns null when there is nothing to offer", () => {
    expect(candidateUpdate([])).toBeNull();
  });

  it("names the words and tells her to match by sound", () => {
    const update = candidateUpdate(["grenouille", "étang"]);
    expect(update).toContain("grenouille, étang");
    expect(update).toMatch(/match by sound/i);
  });

  it("caps the list so it stays a shortlist", () => {
    const many = Array.from({ length: 25 }, (_, i) => `mot${i}`);
    const update = candidateUpdate(many)!;
    // Parse the list rather than substring-matching: "mot1" appears inside
    // "mot15", which would over-count.
    const listed = update.split("place: ")[1].split(".")[0].split(", ");
    expect(listed).toHaveLength(MAX_CANDIDATES);
    // Keeps the most recent, which are the likeliest to be asked about.
    expect(update).toContain("mot24");
    expect(listed).not.toContain("mot0");
  });
});

describe("REPAIR_INSTRUCTION", () => {
  it("tells her to confirm rather than guess", () => {
    // The whole point: a wrong confident answer is the failure being removed,
    // so the instruction must not leave "just pick the closest" as an option.
    expect(REPAIR_INSTRUCTION).toMatch(/confirm/i);
    expect(REPAIR_INSTRUCTION).toMatch(/do NOT answer/i);
  });
});
