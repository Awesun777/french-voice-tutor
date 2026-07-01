import { describe, it, expect } from "vitest";
import { computeNextReview, quizGradeFor, orderForReview, interleaveReviewNew } from "./db";
import type { VocabEntry } from "../drizzle/schema";

// ── interleaveReviewNew: must always terminate (regression for the prod hang) ──

describe("interleaveReviewNew", () => {
  it("terminates when reviews run out with new words left (the hang case)", () => {
    // 2 reviews + 5 new: the old loop spun forever here (position 2, not %3).
    const out = interleaveReviewNew([1, 2], [10, 11, 12, 13, 14]);
    expect(out.length).toBe(7);
    expect(out).toEqual([1, 2, 10, 11, 12, 13, 14]);
  });

  it("inserts a new card after every 3 reviews", () => {
    const out = interleaveReviewNew([1, 2, 3, 4, 5, 6], [10, 11]);
    expect(out).toEqual([1, 2, 3, 10, 4, 5, 6, 11]);
  });

  it("handles empty lists and new-only / review-only", () => {
    expect(interleaveReviewNew([], [])).toEqual([]);
    expect(interleaveReviewNew([], [10, 11])).toEqual([10, 11]);
    expect(interleaveReviewNew([1, 2], [])).toEqual([1, 2]);
  });

  it("never loops forever across many review/new size combinations", () => {
    for (let r = 0; r <= 20; r++) {
      for (let n = 0; n <= 20; n++) {
        const dues = Array.from({ length: r }, (_, i) => i);
        const news = Array.from({ length: n }, (_, i) => 100 + i);
        const out = interleaveReviewNew(dues, news);
        expect(out.length).toBe(r + n); // completes and keeps every card exactly once
      }
    }
  });
});

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
