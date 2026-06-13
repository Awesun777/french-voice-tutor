import { describe, it, expect } from "vitest";
import { computeNextReview, quizGradeFor, orderForReview } from "./db";
import type { VocabEntry } from "../drizzle/schema";

// ── Quiz auto-grade mapping (no self-rating) ──────────────────────────────────

describe("quizGradeFor", () => {
  it("maps a wrong answer to Again (1) regardless of streak", () => {
    expect(quizGradeFor(0, false)).toBe(1);
    expect(quizGradeFor(5, false)).toBe(1);
  });

  it("maps the 1st and 2nd consecutive correct to Good (3)", () => {
    expect(quizGradeFor(0, true)).toBe(3); // 1st correct
    expect(quizGradeFor(1, true)).toBe(3); // 2nd correct
  });

  it("maps the 3rd consecutive correct (and beyond) to Easy (5)", () => {
    expect(quizGradeFor(2, true)).toBe(5); // 3rd correct
    expect(quizGradeFor(9, true)).toBe(5);
  });
});

// ── computeNextReview behaviour the quiz/flashcard flows rely on ──────────────

describe("computeNextReview", () => {
  const base = { easeFactor: 2.5, interval: 0, repetitions: 0 };

  it("a wrong answer (grade 1) resets repetitions and schedules same-day", () => {
    const r = computeNextReview({ easeFactor: 2.5, interval: 10, repetitions: 4 }, 1);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(0);
  });

  it("repeated correct answers grow the interval (de-prioritize)", () => {
    const first = computeNextReview(base, 3);
    expect(first.interval).toBe(1);
    const second = computeNextReview(first, 3);
    expect(second.interval).toBe(6);
    const third = computeNextReview(second, 3);
    expect(third.interval).toBeGreaterThan(6);
  });

  it("Easy (5) raises ease faster than Good (3)", () => {
    const easy = computeNextReview(base, 5);
    const good = computeNextReview(base, 3);
    expect(easy.easeFactor).toBeGreaterThan(good.easeFactor);
  });
});

// ── orderForReview: overdue/new first, then the rest ──────────────────────────

describe("orderForReview", () => {
  const now = Date.now();
  const w = (id: number, over: Partial<VocabEntry>): VocabEntry =>
    ({
      id, userId: 1, term: `t${id}`, translation: `x${id}`, entryKind: "word",
      lessonSource: null, starred: false, quizCount: 0, wrongCount: 0, lastQuizzed: null,
      sm2EaseFactor: 2.5, sm2Interval: 0, sm2Repetitions: 0,
      sm2NextReviewAt: null, sm2LastReviewAt: null, sm2Status: "new",
      dateKey: "2026-06-12", groupLabel: null, createdAt: new Date(), updatedAt: new Date(),
      ...over,
    }) as VocabEntry;

  it("puts new + overdue words ahead of not-yet-due words", () => {
    const future = w(1, { sm2Status: "review", sm2NextReviewAt: now + 1_000_000 });
    const newWord = w(2, { sm2Status: "new", sm2NextReviewAt: null });
    const overdue = w(3, { sm2Status: "review", sm2NextReviewAt: now - 1_000_000 });
    const ordered = orderForReview([future, newWord, overdue]);
    // future word must come last
    expect(ordered[ordered.length - 1].id).toBe(1);
    // the first two are the due/new ones (order among them by soonest due)
    expect(ordered.slice(0, 2).map((x) => x.id).sort()).toEqual([2, 3]);
  });

  it("orders due words by soonest next-review first", () => {
    const a = w(1, { sm2Status: "review", sm2NextReviewAt: now - 100 });
    const b = w(2, { sm2Status: "review", sm2NextReviewAt: now - 5000 });
    const ordered = orderForReview([a, b]);
    expect(ordered.map((x) => x.id)).toEqual([2, 1]);
  });
});
