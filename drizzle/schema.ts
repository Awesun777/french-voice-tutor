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
  /**
   * Which LLM answers this user's VOICE questions (extension ⌥S and the
   * voice palette): "openai" (gpt-4o-mini, default) or "deepseek"
   * (deepseek-v4-flash). A preference for invokeLLM's provider order, not a
   * pin — the other providers stay as fallbacks. Typed tutor chat ignores it.
   */
  voiceChatModel: varchar("voiceChatModel", { length: 16 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Password credentials for email/password accounts, one row per user.
 *
 * Its own table rather than a passwordHash column on users: most rows in users
 * are Google accounts that must never have a password path, and a separate
 * table makes "has a password" a join hit instead of a nullable column every
 * auth path has to remember to check. The unique email here is also what
 * enforces one password account per address — users.email carries no unique
 * constraint because Google accounts share it freely.
 */
export const emailCredentials = mysqlTable("email_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  /** Stored lowercased; lookups must lowercase before comparing. */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Format "scrypt:<salt hex>:<hash hex>" — see server/_core/emailAuth.ts. */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailCredential = typeof emailCredentials.$inferSelect;

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
 * Queue for the Listening Lab ingest dashboard. The website only writes and
 * reads rows here; the actual download/transcribe/gloss runs on a local
 * machine (see scripts/ingest-worker.ts) because YouTube bot-blocks
 * datacentre IPs — same reason ingest-video.ts has always run locally.
 */
export const ingestJobs = mysqlTable("ingest_jobs", {
  id: int("id").autoincrement().primaryKey(),
  url: varchar("url", { length: 512 }).notNull(),
  youtubeId: varchar("youtube_id", { length: 32 }).notNull(),
  level: varchar("level", { length: 8 }).default("B1").notNull(),
  /** pending → running → done | failed */
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  error: text("error"),
  title: varchar("title", { length: 512 }),
  /** Approximate ingestion cost, from Whisper minutes + measured LLM tokens. */
  costCents: int("cost_cents"),
  requestedBy: int("requested_by").notNull(),
  requestedAt: bigint("requested_at", { mode: "number" }).notNull(),
  startedAt: bigint("started_at", { mode: "number" }),
  finishedAt: bigint("finished_at", { mode: "number" }),
});
export type IngestJob = typeof ingestJobs.$inferSelect;

/**
 * Heartbeats from the local scheduled jobs (daily articles, ingest worker),
 * written directly by the scripts so the admin Ops tab can show what launchd
 * alone knows: whether a run started, how it ended, and what it did.
 */
export const jobRuns = mysqlTable("job_runs", {
  id: int("id").autoincrement().primaryKey(),
  job: varchar("job", { length: 64 }).notNull(),
  /** running → ok | failed */
  status: varchar("status", { length: 16 }).default("running").notNull(),
  summary: varchar("summary", { length: 512 }),
  /** One line per item the run produced — «title» · source — for the Ops feed. */
  detail: text("detail"),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  finishedAt: bigint("finished_at", { mode: "number" }),
});
export type JobRun = typeof jobRuns.$inferSelect;

/** The admin's product pipeline — the Ops tab's strikethrough checklist. */
export const opsTodos = mysqlTable("ops_todos", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 512 }).notNull(),
  done: int("done").default(0).notNull(),
  /** high | med | low — coarse tiers; manual order refines within a tier. */
  priority: varchar("priority", { length: 8 }).default("med").notNull(),
  /** Optional due date (ms epoch, date-granular). */
  deadline: bigint("deadline", { mode: "number" }),
  position: int("position").default(0).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  doneAt: bigint("done_at", { mode: "number" }),
});
export type OpsTodo = typeof opsTodos.$inferSelect;

/** AI-related subscriptions the admin tracks on the Ops tab. */
export const opsSubscriptions = mysqlTable("ops_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  /** Cents, so $20.00 stores exactly. */
  costCents: int("cost_cents").default(0).notNull(),
  /** monthly | yearly */
  cycle: varchar("cycle", { length: 8 }).default("monthly").notNull(),
  /** Next renewal date (ms epoch) — legacy; new rows track lastPaidAt instead. */
  renewsAt: bigint("renews_at", { mode: "number" }),
  /** When the subscription was last paid; the next payment is derived from it. */
  lastPaidAt: bigint("last_paid_at", { mode: "number" }),
  notes: varchar("notes", { length: 512 }),
  active: int("active").default(1).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type OpsSubscription = typeof opsSubscriptions.$inferSelect;

/**
 * Voice-chat test recordings, uploaded from the admin Test Logs tab. Only the
 * storage key persists — download URLs are re-derived per request, so signed
 * URLs can expire without stranding rows.
 */
export const testLogs = mysqlTable("test_logs", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull(),
  mimeType: varchar("mime_type", { length: 64 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  notes: varchar("notes", { length: 512 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type TestLog = typeof testLogs.$inferSelect;

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
  /** The YouTube channel's profile picture, shown on the feed card. */
  channelAvatarUrl: varchar("channelAvatarUrl", { length: 1024 }),
  /** Optional CEFR hint shown on the feed card, e.g. "B1". */
  level: varchar("level", { length: 16 }),
  /**
   * JSON array of content tags (e.g. ["interview","news"]) picked by the
   * ingest's auto-tagger from a fixed vocabulary. Admin-only for now: shown in
   * the Ops/Ingest dashboards, deliberately NOT returned by the user-facing
   * videos endpoints until categorization/search ships.
   */
  tags: text("tags"),
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
