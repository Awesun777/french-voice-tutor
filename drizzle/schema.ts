import {
  bigint,
  boolean,
  double,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /**
   * Persistent user memory: a compact LLM-generated note about the user's
   * hobbies, preferences, life events, and personal details extracted from
   * voice sessions. Injected into Romain/Anna context at session start.
   */
  userMemory: text("userMemory"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Vocabulary entries saved by each user.
 * entryKind: 'word' | 'phrase'
 */
export const vocabEntries = mysqlTable("vocab_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  term: varchar("term", { length: 512 }).notNull(),
  translation: varchar("translation", { length: 512 }).notNull(),
  entryKind: mysqlEnum("entryKind", ["word", "phrase"]).default("word").notNull(),
  lessonSource: varchar("lessonSource", { length: 256 }),
  starred: boolean("starred").default(false).notNull(),
  // Legacy quiz tracking
  quizCount: int("quizCount").default(0).notNull(),
  wrongCount: int("wrongCount").default(0).notNull(),
  lastQuizzed: timestamp("lastQuizzed"),
  // SM-2 spaced repetition fields
  sm2EaseFactor: double("sm2EaseFactor").default(2.5).notNull(),
  sm2Interval: int("sm2Interval").default(0).notNull(),       // days until next review
  sm2Repetitions: int("sm2Repetitions").default(0).notNull(), // consecutive correct answers
  sm2NextReviewAt: bigint("sm2NextReviewAt", { mode: "number" }), // UTC ms timestamp
  sm2LastReviewAt: bigint("sm2LastReviewAt", { mode: "number" }), // UTC ms timestamp
  sm2Status: mysqlEnum("sm2Status", ["new", "learning", "review", "mastered"]).default("new").notNull(),
  // Date key for grouping (YYYY-MM-DD or custom label up to 100 chars)
  dateKey: varchar("dateKey", { length: 100 }).notNull(),
  // Optional sub-group label within a date (e.g. "At the restaurant", "Chapter 3")
  groupLabel: varchar("groupLabel", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VocabEntry = typeof vocabEntries.$inferSelect;
export type InsertVocabEntry = typeof vocabEntries.$inferInsert;

/**
 * Quiz sessions — one row per completed quiz.
 */
export const quizSessions = mysqlTable("quiz_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  score: int("score").notNull(),
  total: int("total").notNull(),
  direction: mysqlEnum("direction", ["fr2en", "en2fr"]).notNull(),
  bucketStart: varchar("bucketStart", { length: 100 }),
  bucketEnd: varchar("bucketEnd", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type QuizSession = typeof quizSessions.$inferSelect;

/**
 * Tutor chat messages per user.
 */
export const tutorMessages = mysqlTable("tutor_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TutorMessage = typeof tutorMessages.$inferSelect;

/**
 * Voice chat sessions — one row per voice conversation.
 * transcript: JSON array of { role, text, timestamp }
 * savedWords: JSON array of { term, translation, type }
 */
export const voiceSessions = mysqlTable("voice_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  transcript: text("transcript"), // JSON string
  summary: text("summary"),
  savedWords: text("savedWords"), // JSON string
  startedAt: bigint("startedAt", { mode: "number" }).notNull(),
  endedAt: bigint("endedAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceSession = typeof voiceSessions.$inferSelect;

/**
 * Shared dictionary cache — stores completed LLM lookup results keyed by
 * normalized term so any user's first lookup populates the cache for all.
 */
export const dictCache = mysqlTable("dict_cache", {
  termKey:   varchar("term_key", { length: 512 }).primaryKey(),
  entryJson: text("entry_json").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type DictCacheEntry = typeof dictCache.$inferSelect;

/**
 * Per-user SM-2 review settings.
 */
export const reviewSettings = mysqlTable("review_settings", {
  userId: int("userId").primaryKey(),
  dailyNewWords: int("dailyNewWords").default(10).notNull(),
  dailyReviewCap: int("dailyReviewCap").default(20).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReviewSettings = typeof reviewSettings.$inferSelect;

/**
 * Google OAuth tokens per user — one row per connected Google account.
 * accessToken is short-lived; refreshToken is used to obtain new access tokens.
 */
export const googleAccounts = mysqlTable("google_accounts", {
  userId: int("userId").primaryKey(),
  googleId: varchar("googleId", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name"),
  picture: text("picture"),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(), // UTC ms
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GoogleAccount = typeof googleAccounts.$inferSelect;

/**
 * Per-user Google Drive sync settings.
 * sourceDocUrl: the Google Doc URL to sync from.
 * exportFolderId: the Drive folder ID to export library into.
 * lastSyncedAt: UTC ms timestamp of last successful sync.
 */
export const googleDriveSettings = mysqlTable("google_drive_settings", {
  userId: int("userId").primaryKey(),
  sourceDocUrl: text("sourceDocUrl"),
  exportFolderId: varchar("exportFolderId", { length: 256 }),
  lastSyncedAt: bigint("lastSyncedAt", { mode: "number" }),
  /**
   * Which AI model to use for vocab extraction from Google Docs.
   * 'deepseek-v4-flash' (default) or 'gemini-2.5-flash' (requires GOOGLE_AI_API_KEY).
   */
  extractionModel: mysqlEnum("extractionModel", ["deepseek-v4-flash", "gemini-2.5-flash"])
    .default("deepseek-v4-flash")
    .notNull(),
  /**
   * Google Docs revision ID from the last successful sync.
   * Used for incremental sync: if the revision hasn't changed, skip LLM extraction entirely.
   */
  lastRevisionId: varchar("lastRevisionId", { length: 256 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GoogleDriveSettings = typeof googleDriveSettings.$inferSelect;

/**
 * Words extracted from a user's Google Doc sync that are pending review.
 * status: 'pending' | 'accepted' | 'skipped'
 */
export const pendingImports = mysqlTable("pending_imports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  term: varchar("term", { length: 512 }).notNull(),
  translation: varchar("translation", { length: 512 }).notNull(),
  kind: mysqlEnum("kind", ["word", "phrase"]).default("word").notNull(),
  dateKey: varchar("dateKey", { length: 100 }).notNull(),
  // Optional sub-group label within a date (e.g. "At the restaurant", "Chapter 3")
  groupLabel: varchar("groupLabel", { length: 256 }),
  status: mysqlEnum("status", ["pending", "accepted", "skipped"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PendingImport = typeof pendingImports.$inferSelect;
