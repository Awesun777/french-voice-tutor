import { describe, it, expect } from "vitest";

import {
  TCF_MOCK_EXAMS,
  TCF_SECTION_META,
  DEFAULT_TCF_MOCK_EXAM,
  getTcfMockItem,
  transcriptOf,
  consigneFor,
} from "@shared/tcfMockExams";

describe("the TCF mock exam bank", () => {
  it("keys every exam by its own id and resolves the default", () => {
    for (const [key, exam] of Object.entries(TCF_MOCK_EXAMS)) {
      expect(exam.id).toBe(key);
    }
    expect(TCF_MOCK_EXAMS[DEFAULT_TCF_MOCK_EXAM.id]).toBe(DEFAULT_TCF_MOCK_EXAM);
  });

  it("has exactly 40 items numbered 1..40 in the official section order", () => {
    for (const exam of Object.values(TCF_MOCK_EXAMS)) {
      expect(exam.items.map(i => i.n)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
      for (const item of exam.items) {
        const [lo, hi] = TCF_SECTION_META[item.section].range;
        expect(item.n, `item ${item.n} section ${item.section}`).toBeGreaterThanOrEqual(lo);
        expect(item.n, `item ${item.n} section ${item.section}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("gives every item four distinct choices, a valid answer and a note", () => {
    for (const exam of Object.values(TCF_MOCK_EXAMS)) {
      for (const item of exam.items) {
        expect(item.choices).toHaveLength(4);
        expect(new Set(item.choices.map(c => c.trim())).size).toBe(4);
        expect(["A", "B", "C", "D"]).toContain(item.answer);
        expect(item.note.trim()).not.toBe("");
      }
    }
  });

  it("shapes each section the way the test does", () => {
    for (const exam of Object.values(TCF_MOCK_EXAMS)) {
      for (const item of exam.items) {
        if (item.section === "oral") {
          expect(item.audio?.length ?? 0, `item ${item.n} needs a script`).toBeGreaterThan(0);
          expect(item.passage).toBeUndefined();
          // The spoken question is the last turn, read by the narrator.
          const last = item.audio![item.audio!.length - 1];
          if (!item.spokenChoices) expect(last.speaker).toBe("narratrice");
          // Spoken-choice items announce "Réponse A." … "Réponse D." in order.
          if (item.spokenChoices) {
            const labels = item.audio!.filter(s => /^Réponse [ABCD]\.$/.test(s.text)).map(s => s.text);
            expect(labels).toEqual(["Réponse A.", "Réponse B.", "Réponse C.", "Réponse D."]);
          }
        }
        if (item.section === "structure") {
          expect(item.question).toMatch(/\.\.\./);
          expect(item.audio).toBeUndefined();
          expect(item.passage).toBeUndefined();
        }
        if (item.section === "ecrit") {
          expect(item.passage?.trim()).toBeTruthy();
          expect(item.question?.trim()).toBeTruthy();
          expect(item.audio).toBeUndefined();
        }
      }
    }
  });

  it("keeps every speaker turn under the TTS request budget", () => {
    for (const exam of Object.values(TCF_MOCK_EXAMS)) {
      for (const item of exam.items) {
        for (const seg of item.audio ?? []) {
          expect(seg.text.length, `item ${item.n}`).toBeLessThanOrEqual(900);
          expect(seg.text.trim()).not.toBe("");
        }
      }
    }
  });

  it("builds transcripts and consignes", () => {
    const q1 = getTcfMockItem(DEFAULT_TCF_MOCK_EXAM.id, 1)!;
    expect(transcriptOf(q1)).toContain("Réponse A.");
    expect(consigneFor(q1)).toMatch(/4 réponses/);
    const q20 = getTcfMockItem(DEFAULT_TCF_MOCK_EXAM.id, 20)!;
    expect(transcriptOf(q20)).toBe("");
    expect(consigneFor(q20)).toBe(TCF_SECTION_META.structure.consigne);
    expect(getTcfMockItem("nope", 1)).toBeNull();
    expect(getTcfMockItem(DEFAULT_TCF_MOCK_EXAM.id, 41)).toBeNull();
  });
});
