import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ─────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getVocabByUser: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      term: "bonjour",
      translation: "hello",
      partOfSpeech: "interjection",
      exampleSentence: "Bonjour, comment ça va?",
      notes: "",
      starred: false,
      dateKey: "2026-03-26",
      quizCount: 0,
      lastQuizzed: null,
      easeFactor: 2.5,
      interval: 1,
      createdAt: new Date("2026-03-26T00:00:00Z"),
      updatedAt: new Date("2026-03-26T00:00:00Z"),
    },
    {
      id: 2,
      userId: 1,
      term: "merci",
      translation: "thank you",
      partOfSpeech: "interjection",
      exampleSentence: "Merci beaucoup!",
      notes: "",
      starred: true,
      dateKey: "2026-03-26",
      quizCount: 3,
      lastQuizzed: new Date("2026-03-25T00:00:00Z"),
      easeFactor: 2.5,
      interval: 3,
      createdAt: new Date("2026-03-26T00:00:00Z"),
      updatedAt: new Date("2026-03-26T00:00:00Z"),
    },
  ]),
  addVocabEntry: vi.fn().mockResolvedValue({ id: 3, term: "au revoir", translation: "goodbye" }),
  addVocabEntries: vi.fn().mockResolvedValue([{ id: 4 }]),
  deleteVocabEntry: vi.fn().mockResolvedValue(undefined),
  toggleVocabStar: vi.fn().mockResolvedValue(undefined),
  updateVocabEntry: vi.fn().mockResolvedValue(undefined),
  saveQuizSession: vi.fn().mockResolvedValue(undefined),
  getQuizSessions: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, score: 8, total: 10, direction: "fr2en", bucketStart: "2026-03-26", bucketEnd: "2026-03-26", createdAt: new Date("2026-03-26T00:00:00Z") },
  ]),
  getTutorHistory: vi.fn().mockResolvedValue([]),
  saveTutorMessage: vi.fn().mockResolvedValue(undefined),
  clearTutorHistory: vi.fn().mockResolvedValue(undefined),
  getVocabStats: vi.fn().mockResolvedValue({ total: 2, today: 2, byDay: [{ date: "2026-03-26", count: 2 }] }),
}));

// ─── Mock LLM ────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"correct":true,"note":""}' } }],
  }),
}));

// ─── Mock voice transcription ─────────────────────────────────────────────────
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: "bonjour", language: "fr", segments: [] }),
}));

// ─── Mock storage ─────────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "audio/test.webm", url: "https://cdn.example.com/audio/test.webm" }),
}));

// ─── Test context factory ─────────────────────────────────────────────────────
function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("vocab.list", () => {
  it("returns vocab entries for the user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.vocab.list();
    expect(result).toHaveLength(2);
    expect(result[0].term).toBe("bonjour");
    expect(result[1].term).toBe("merci");
  });
});

describe("vocab.add", () => {
  it("adds a new vocab entry", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.vocab.add({
      term: "au revoir",
      translation: "goodbye",
      partOfSpeech: "phrase",
    });
    expect(result).toBeDefined();
  });
});

describe("vocab.delete", () => {
  it("deletes a vocab entry", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.vocab.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("vocab.toggleStar", () => {
  it("toggles the star on a vocab entry", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.vocab.toggleStar({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("quiz.saveSession", () => {
  it("saves a quiz session", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.saveSession({
      score: 8,
      total: 10,
      direction: "fr2en",
      bucketStart: "2026-03-26",
      bucketEnd: "2026-03-26",
    });
    expect(result).toEqual({ success: true });
  });
});

describe("quiz.history", () => {
  it("returns quiz history for the user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.history();
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(8);
    expect(result[0].total).toBe(10);
  });
});

describe("quiz.gradeAnswer", () => {
  it("grades a correct answer", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.gradeAnswer({
      userAnswer: "hello",
      correctAnswer: "hello",
      term: "bonjour",
    });
    expect(result).toHaveProperty("correct");
    expect(result).toHaveProperty("note");
  });
});

describe("tutor.history", () => {
  it("returns empty history for new user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tutor.history();
    expect(result).toEqual([]);
  });
});

describe("tutor.clear", () => {
  it("clears tutor history", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.tutor.clear();
    expect(result).toEqual({ success: true });
  });
});

describe("progress.stats", () => {
  it("returns stats including streak and word counts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.progress.stats();
    expect(result).toHaveProperty("totalWords");
    expect(result).toHaveProperty("currentStreak");
    expect(result).toHaveProperty("dueCount");
    expect(result).toHaveProperty("byDay");
    expect(result.totalWords).toBe(2);
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

describe("storage.uploadAudio", () => {
  it("uploads audio and returns a URL", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const fakeBase64 = Buffer.from("fake audio data").toString("base64");
    const result = await caller.storage.uploadAudio({ base64: fakeBase64, mimeType: "audio/webm" });
    expect(result).toHaveProperty("url");
    expect(result.url).toContain("https://");
  });
});
