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
  // NOTE: term_key runs under utf8mb4_bin in production (accent-EXACT), set by
  // drizzle/manual/2026-08-08-dict-cache-binary-collation.sql. The database
  // default (utf8mb4_0900_ai_ci) is accent-insensitive, which made la/là one
  // primary key and served wrong entries. Keep the collation if this table is
  // ever recreated.
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
  dailyNewWords: int("dailyNewWords").default(30).notNull(),
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
  /**
   * JSON array of SHA-256 hashes, one per date section, from the last
   * successful sync. Sections whose hash is unchanged are skipped during
   * extraction, so LLM cost scales with new/edited content, not doc size.
   */
  processedSectionHashes: text("processedSectionHashes"),
  /**
   * Background auto-sync schedule. The daily cron tick at 08:00 UTC syncs
   * 'daily' users; 'weekly' users sync when their last sync is ≥6 days old.
   */
  autoSyncFrequency: mysqlEnum("autoSyncFrequency", ["off", "daily", "weekly"])
    .default("off")
    .notNull(),
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

/**
 * ─── Curated video lessons ───────────────────────────────────────────────────
 * A YouTube video whose transcript and glosses were computed ahead of time by
 * scripts/ingest-video.ts. Playback stays in YouTube's own iframe, so no media
 * is stored here — only the timed transcript and the per-token meanings, which
 * is what makes hovering instant and costs one LLM pass per video rather than
 * one per view.
 */
export const videoLessons = mysqlTable("video_lessons", {
  id: int("id").autoincrement().primaryKey(),
  youtubeId: varchar("youtubeId", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  channel: varchar("channel", { length: 256 }),
  durationSec: int("durationSec").notNull(),
  thumbnailUrl: varchar("thumbnailUrl", { length: 1024 }),
  /** Optional CEFR hint shown on the feed card, e.g. "B1". */
  level: varchar("level", { length: 16 }),
  addedAt: bigint("addedAt", { mode: "number" }).notNull(),
});
export type VideoLesson = typeof videoLessons.$inferSelect;

/**
 * One transcript cue (roughly a spoken line) of a video lesson.
 *
 * Stored per row rather than as one blob on the lesson: a tokenised transcript
 * runs to hundreds of KB and MySQL `text` caps at 64 KB, which would silently
 * truncate longer videos.
 *
 * `tokensJson` holds this cue's spans as
 *   [{ s, e, surface, lemma, gloss, kind: "word" | "expression", tMs }]
 * where s/e are character offsets into `text` and tMs is the word's start time
 * from Whisper (used to emphasise the word currently being spoken).
 */
export const videoCues = mysqlTable("video_cues", {
  id: int("id").autoincrement().primaryKey(),
  lessonId: int("lessonId").notNull(),
  idx: int("idx").notNull(),
  startMs: int("startMs").notNull(),
  endMs: int("endMs").notNull(),
  text: text("text").notNull(),
  tokensJson: text("tokensJson").notNull(),
  /**
   * English translation of this whole cue. Word-by-word glosses cannot express
   * a line whose meaning does not compose ("je suis allé" is "I went", not
   * "I am gone"), so the reader can reveal the sentence alongside them.
   */
  translationEn: text("translationEn"),
});
export type VideoCue = typeof videoCues.$inferSelect;

/**
 * A curated French news article for the Reading tab.
 *
 * Deliberately its own pair of tables rather than sharing the video ones:
 * Reading and the Listening Lab are independent sections, and an article has no
 * concept of a timeline while a lesson has no concept of a byline.
 */
export const articles = mysqlTable("articles", {
  id: int("id").autoincrement().primaryKey(),
  /** URL-safe id derived from the title; how the client asks for one article. */
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  /**
   * English rendering of the headline, shown under it on the front page so a
   * reader can tell what a piece is about before committing to reading it.
   * Headline only — the body stays French, which is the point of the tab.
   */
  titleEn: varchar("titleEn", { length: 512 }),
  /** Publication name, e.g. "Le Monde". */
  source: varchar("source", { length: 256 }),
  /** Canonical link, shown as an attribution link on the article. */
  url: varchar("url", { length: 1024 }),
  /** One-or-two-sentence French standfirst shown on the feed card. */
  summary: text("summary"),
  imageUrl: varchar("imageUrl", { length: 1024 }),
  /** Optional CEFR hint shown on the feed card, e.g. "B1". */
  level: varchar("level", { length: 16 }),
  /**
   * Which shelf this article sits on in the Reading tab, e.g.
   * "France 24 · France". Free text rather than an enum so adding a source is
   * an ingest argument, not a migration.
   */
  section: varchar("section", { length: 128 }),
  wordCount: int("wordCount").notNull(),
  publishedAt: bigint("publishedAt", { mode: "number" }),
  addedAt: bigint("addedAt", { mode: "number" }).notNull(),
});
export type Article = typeof articles.$inferSelect;

/**
 * One heading or paragraph of an article.
 *
 * Stored per row rather than as one blob on the article, for the same reason as
 * video_cues: a tokenised article runs to hundreds of KB and MySQL `text` caps
 * at 64 KB, which would silently truncate longer pieces.
 *
 * `tokensJson` holds this block's spans as
 *   [{ s, e, surface, lemma, gloss, kind: "word" | "expression" }]
 * where s/e are character offsets into `text`. No timings — an article has no
 * clock.
 */
export const articleBlocks = mysqlTable("article_blocks", {
  id: int("id").autoincrement().primaryKey(),
  articleId: int("articleId").notNull(),
  idx: int("idx").notNull(),
  kind: mysqlEnum("kind", ["heading", "paragraph"]).default("paragraph").notNull(),
  text: text("text").notNull(),
  tokensJson: text("tokensJson").notNull(),
  /** English translation of this whole block. See videoCues.translationEn. */
  translationEn: text("translationEn"),
});
export type ArticleBlock = typeof articleBlocks.$inferSelect;
