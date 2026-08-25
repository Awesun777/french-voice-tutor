import { describe, it, expect } from "vitest";

import { TASK2_SUJETS, pickTask2Sujet, resolveTask2Sujet, DEFAULT_TASK2_SUJET } from "./tcfSujets";

describe("pickTask2Sujet", () => {
  it("honours a pinned id", () => {
    for (const id of Object.keys(TASK2_SUJETS)) {
      expect(pickTask2Sujet(id).id).toBe(id);
    }
  });

  it("falls back to the bank when the pin is 'auto' or unknown", () => {
    for (const pin of ["auto", "nope", "", undefined]) {
      expect(TASK2_SUJETS[pickTask2Sujet(pin).id]).toBeDefined();
    }
  });
});

describe("the sujet bank", () => {
  it("keys every entry by its own id", () => {
    for (const [key, sujet] of Object.entries(TASK2_SUJETS)) {
      expect(sujet.id).toBe(key);
    }
  });

  it("gives every sujet the fields the agent interpolates", () => {
    // consigne / apercu / fiche ship as dynamic variables; an empty one leaves
    // a literal {{placeholder}} in Marc's mouth mid-exam.
    for (const sujet of Object.values(TASK2_SUJETS)) {
      expect(sujet.consigne.trim()).not.toBe("");
      expect(sujet.apercu.trim()).not.toBe("");
      expect(sujet.fiche.trim()).not.toBe("");
      expect(sujet.image).toMatch(/^\/tcf\/.+\.png$/);
      expect(sujet.alt.trim()).not.toBe("");
    }
  });

  it("keeps the default resolvable", () => {
    expect(resolveTask2Sujet(DEFAULT_TASK2_SUJET.id)).toBe(DEFAULT_TASK2_SUJET);
  });
});
