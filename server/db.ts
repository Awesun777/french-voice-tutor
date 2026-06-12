import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  GoogleAccount,
  GoogleDriveSettings,
  InsertUser,
  PendingImport,
  QuizSession,
  TutorMessage,
  VocabEntry,
  VoiceSession,
  googleAccounts,
  googleDriveSettings,
  pendingImports,
  quizSessions,
  tutorMessages,
  users,
  vocabEntries,
  voiceSessions,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User helpers ──────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Vocab helpers ─────────────────────────────────────────────────────────────

export async function getVocabByUser(userId: number): Promise<VocabEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId))
    .orderBy(desc(vocabEntries.createdAt));
}

export async function addVocabEntry(
  userId: number,
  entry: {
    term: string;
    translation: string;
    entryKind: "word" | "phrase";
    lessonSource?: string;
    dateKey: string;
    groupLabel?: string | null;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(vocabEntries).values({
    userId,
    term: entry.term,
    translation: entry.translation,
    entryKind: entry.entryKind,
    lessonSource: entry.lessonSource ?? null,
    dateKey: entry.dateKey,
    groupLabel: entry.groupLabel ?? null,
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function addVocabEntries(
  userId: number,
  entries: {
    term: string;
    translation: string;
    entryKind: "word" | "phrase";
    lessonSource?: string;
    dateKey: string;
    groupLabel?: string | null;
  }[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (!entries.length) return;
  await db.insert(vocabEntries).values(
    entries.map((e) => ({
      userId,
      term: e.term,
      translation: e.translation,
      entryKind: e.entryKind,
      lessonSource: e.lessonSource ?? null,
      dateKey: e.dateKey,
      groupLabel: e.groupLabel ?? null,
    }))
  );
}

export async function updateVocabEntry(
  userId: number,
  id: number,
  patch: Partial<Pick<VocabEntry, "term" | "translation" | "entryKind" | "starred" | "quizCount" | "wrongCount" | "lastQuizzed">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(vocabEntries)
    .set(patch as any)
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)));
}

export async function deleteVocabGroup(userId: number, dateKey: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.dateKey, dateKey)));
}
export async function renameVocabGroup(
  userId: number,
  oldDateKey: string,
  newDateKey: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(vocabEntries)
    .set({ dateKey: newDateKey })
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.dateKey, oldDateKey)));
}
export async function deleteVocabEntry(userId: number, id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(vocabEntries)
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)));
}

export async function toggleVocabStar(userId: number, id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(vocabEntries)
    .set({ starred: sql`NOT ${vocabEntries.starred}` })
    .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId)));
}

// ─── Quiz helpers ──────────────────────────────────────────────────────────────

export async function saveQuizSession(session: {
  userId: number;
  score: number;
  total: number;
  direction: "fr2en" | "en2fr";
  bucketStart?: string;
  bucketEnd?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(quizSessions).values(session);
}

export async function getQuizSessions(userId: number): Promise<QuizSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(quizSessions)
    .where(eq(quizSessions.userId, userId))
    .orderBy(desc(quizSessions.createdAt))
    .limit(50);
}

// ─── Tutor helpers ─────────────────────────────────────────────────────────────

export async function getTutorHistory(userId: number, limit = 30): Promise<TutorMessage[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(tutorMessages)
    .where(eq(tutorMessages.userId, userId))
    .orderBy(desc(tutorMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function saveTutorMessage(
  userId: number,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(tutorMessages).values({ userId, role, content });
}

export async function clearTutorHistory(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(tutorMessages).where(eq(tutorMessages.userId, userId));
}

// ─── Voice session helpers ─────────────────────────────────────────────────

export async function createVoiceSession(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(voiceSessions).values({
    userId,
    startedAt: Date.now(),
  });
  return (result as any)[0]?.insertId ?? 0;
}

export async function endVoiceSession(
  id: number,
  transcript: string,
  summary: string,
  savedWords: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(voiceSessions)
    .set({ transcript, summary, savedWords, endedAt: Date.now() })
    .where(eq(voiceSessions.id, id));
}

export async function getVoiceSessions(userId: number): Promise<VoiceSession[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(voiceSessions)
    .where(eq(voiceSessions.userId, userId))
    .orderBy(voiceSessions.startedAt);
}

// ─── User memory helpers ─────────────────────────────────────────────────────

export async function getUserMemory(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ userMemory: users.userMemory }).from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? (result[0].userMemory ?? null) : null;
}

export async function updateUserMemory(userId: number, memory: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ userMemory: memory }).where(eq(users.id, userId));
}

// ─── Stats helpers ─────────────────────────────────────────────────────────────

export async function getVocabStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, today: 0, byDay: [] };
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [allEntries, recentEntries] = await Promise.all([
    db
      .select({ dateKey: vocabEntries.dateKey })
      .from(vocabEntries)
      .where(eq(vocabEntries.userId, userId)),
    db
      .select({ dateKey: vocabEntries.dateKey })
      .from(vocabEntries)
      .where(and(eq(vocabEntries.userId, userId), gte(vocabEntries.dateKey, thirtyDaysAgo))),
  ]);

  const total = allEntries.length;
  const todayCount = allEntries.filter((e) => e.dateKey === today).length;

  // Group by day for chart
  const byDayMap: Record<string, number> = {};
  for (const e of recentEntries) {
    byDayMap[e.dateKey] = (byDayMap[e.dateKey] ?? 0) + 1;
  }
  const byDay = Object.entries(byDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return { total, today: todayCount, byDay };
}

// ─── SM-2 helpers ──────────────────────────────────────────────────────────────

import { ReviewSettings, reviewSettings } from "../drizzle/schema";
import { lte, or, isNull } from "drizzle-orm";

/**
 * SM-2 algorithm: given current state and a grade (1-5), compute the next
 * review interval, ease factor, repetitions count, and status.
 *
 * Grade scale:
 *   1 = Again (complete blackout)
 *   2 = Hard (significant difficulty)
 *   3 = Good (correct with some effort)
 *   4 = Easy (correct with minor hesitation)
 *   5 = Perfect (instant recall)
 */
export function computeNextReview(
  current: {
    easeFactor: number;
    interval: number;
    repetitions: number;
  },
  grade: 1 | 2 | 3 | 4 | 5
): {
  easeFactor: number;
  interval: number;
  repetitions: number;
  status: "new" | "learning" | "review" | "mastered";
  nextReviewAt: number; // UTC ms
} {
  let { easeFactor, interval, repetitions } = current;

  if (grade < 3) {
    // Failed: reset repetitions, short interval
    repetitions = 0;
    interval = grade === 1 ? 0 : 1; // Again=same day, Hard=tomorrow
  } else {
    // Passed
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
    // Update ease factor (min 1.3)
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  }

  // Determine status
  let status: "new" | "learning" | "review" | "mastered";
  if (repetitions === 0) {
    status = "new";
  } else if (interval <= 1) {
    status = "learning";
  } else if (interval < 21) {
    status = "review";
  } else {
    status = "mastered";
  }

  const nextReviewAt = Date.now() + interval * 24 * 60 * 60 * 1000;

  return { easeFactor, interval, repetitions, status, nextReviewAt };
}

/**
 * Get words due for review today for a user.
 * Returns up to (dailyNewWords) new words + up to (dailyReviewCap) review words,
 * ordered: overdue first, then new words interleaved every 3 review cards.
 */
export async function getDueVocab(
  userId: number,
  dailyNewWords: number,
  dailyReviewCap: number
): Promise<VocabEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();

  // Fetch new words (never reviewed)
  const newWords = await db
    .select()
    .from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.sm2Status, "new")))
    .orderBy(vocabEntries.createdAt)
    .limit(dailyNewWords);

  // Fetch due review words (nextReviewAt <= now, status != new)
  const dueWords = await db
    .select()
    .from(vocabEntries)
    .where(
      and(
        eq(vocabEntries.userId, userId),
        or(
          isNull(vocabEntries.sm2NextReviewAt),
          lte(vocabEntries.sm2NextReviewAt, now)
        ),
        // Exclude "new" status (handled separately above)
        sql`${vocabEntries.sm2Status} != 'new'`
      )
    )
    .orderBy(vocabEntries.sm2NextReviewAt)
    .limit(dailyReviewCap);

  // Interleave: every 3 review cards, insert 1 new card
  const result: VocabEntry[] = [];
  let newIdx = 0;
  let reviewIdx = 0;
  let position = 0;
  while (reviewIdx < dueWords.length || newIdx < newWords.length) {
    if (reviewIdx < dueWords.length) {
      result.push(dueWords[reviewIdx++]);
      position++;
    }
    if (position % 3 === 0 && newIdx < newWords.length) {
      result.push(newWords[newIdx++]);
    }
  }
  // Append any remaining new words
  while (newIdx < newWords.length) {
    result.push(newWords[newIdx++]);
  }

  return result;
}

/**
 * Submit a SM-2 review grade for a vocab entry.
 */
export async function submitSm2Review(
  userId: number,
  vocabId: number,
  grade: 1 | 2 | 3 | 4 | 5
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select({
      easeFactor: vocabEntries.sm2EaseFactor,
      interval: vocabEntries.sm2Interval,
      repetitions: vocabEntries.sm2Repetitions,
    })
    .from(vocabEntries)
    .where(and(eq(vocabEntries.id, vocabId), eq(vocabEntries.userId, userId)))
    .limit(1);

  if (!rows.length) return;

  const next = computeNextReview(rows[0], grade);

  await db
    .update(vocabEntries)
    .set({
      sm2EaseFactor: next.easeFactor,
      sm2Interval: next.interval,
      sm2Repetitions: next.repetitions,
      sm2Status: next.status,
      sm2NextReviewAt: next.nextReviewAt,
      sm2LastReviewAt: Date.now(),
    })
    .where(and(eq(vocabEntries.id, vocabId), eq(vocabEntries.userId, userId)));
}

/**
 * Get SM-2 status counts for a user.
 */
export async function getSm2Stats(userId: number): Promise<{
  new: number;
  learning: number;
  review: number;
  mastered: number;
  dueToday: number;
}> {
  const db = await getDb();
  if (!db) return { new: 0, learning: 0, review: 0, mastered: 0, dueToday: 0 };

  const rows = await db
    .select({ status: vocabEntries.sm2Status, nextReviewAt: vocabEntries.sm2NextReviewAt })
    .from(vocabEntries)
    .where(eq(vocabEntries.userId, userId));

  const now = Date.now();
  const counts = { new: 0, learning: 0, review: 0, mastered: 0, dueToday: 0 };
  for (const row of rows) {
    counts[row.status]++;
    if (row.status === "new" || (row.nextReviewAt != null && row.nextReviewAt <= now)) {
      counts.dueToday++;
    }
  }
  return counts;
}

/**
 * Get or create review settings for a user.
 */
export async function getReviewSettings(userId: number): Promise<ReviewSettings> {
  const db = await getDb();
  if (!db) return { userId, dailyNewWords: 10, dailyReviewCap: 20, updatedAt: new Date() };

  const rows = await db
    .select()
    .from(reviewSettings)
    .where(eq(reviewSettings.userId, userId))
    .limit(1);

  if (rows.length) return rows[0];

  // Create defaults
  await db.insert(reviewSettings).values({ userId, dailyNewWords: 10, dailyReviewCap: 20 });
  return { userId, dailyNewWords: 10, dailyReviewCap: 20, updatedAt: new Date() };
}

/**
 * Update review settings for a user.
 */
export async function updateReviewSettings(
  userId: number,
  patch: { dailyNewWords?: number; dailyReviewCap?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(reviewSettings)
    .values({ userId, dailyNewWords: patch.dailyNewWords ?? 10, dailyReviewCap: patch.dailyReviewCap ?? 20 })
    .onDuplicateKeyUpdate({ set: patch });
}

// ─── Google Account helpers ────────────────────────────────────────────────────

export async function upsertGoogleAccount(data: {
  userId: number;
  googleId: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(googleAccounts)
    .values({
      userId: data.userId,
      googleId: data.googleId,
      email: data.email,
      name: data.name ?? null,
      picture: data.picture ?? null,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? null,
      expiresAt: data.expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        email: data.email,
        name: data.name ?? null,
        picture: data.picture ?? null,
        accessToken: data.accessToken,
        ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
        expiresAt: data.expiresAt,
      },
    });
}

export async function getGoogleAccountByUserId(userId: number): Promise<GoogleAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.userId, userId)).limit(1);
  return rows[0];
}

export async function getGoogleAccountByGoogleId(googleId: string): Promise<GoogleAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.googleId, googleId)).limit(1);
  return rows[0];
}

export async function deleteGoogleAccount(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(googleAccounts).where(eq(googleAccounts.userId, userId));
}

export async function updateGoogleTokens(userId: number, accessToken: string, expiresAt: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(googleAccounts)
    .set({ accessToken, expiresAt })
    .where(eq(googleAccounts.userId, userId));
}

// ─── Google Drive Settings helpers ────────────────────────────────────────────

export async function getGoogleDriveSettings(userId: number): Promise<GoogleDriveSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(googleDriveSettings).where(eq(googleDriveSettings.userId, userId)).limit(1);
  return rows[0];
}

export async function upsertGoogleDriveSettings(
  userId: number,
  patch: {
    sourceDocUrl?: string | null;
    exportFolderId?: string | null;
    lastSyncedAt?: number | null;
    extractionModel?: "deepseek-v4-flash" | "gemini-2.5-flash";
    lastRevisionId?: string | null;
    processedSectionHashes?: string | null;
    autoSyncFrequency?: "off" | "daily" | "weekly";
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(googleDriveSettings)
    .values({ userId, ...patch })
    .onDuplicateKeyUpdate({ set: patch });
}

// ─── Pending Imports helpers ───────────────────────────────────────────────────

/** Returns only status='pending' imports — used for the review queue UI. */
export async function getPendingImports(userId: number): Promise<PendingImport[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pendingImports)
    .where(and(eq(pendingImports.userId, userId), eq(pendingImports.status, "pending")))
    .orderBy(desc(pendingImports.createdAt));
}

/**
 * Returns all non-skipped pending imports (status = 'pending' OR 'accepted').
 * Used exclusively for building the deduplication set during sync — so that
 * words already in the review queue or already accepted are not re-imported.
 */
export async function getAllNonSkippedPendingImports(userId: number): Promise<PendingImport[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pendingImports)
    .where(and(eq(pendingImports.userId, userId), ne(pendingImports.status, "skipped")));
}

/** Look up a single pending import by ID, regardless of status. */
export async function getPendingImportById(id: number, userId: number): Promise<PendingImport | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(pendingImports)
    .where(and(eq(pendingImports.id, id), eq(pendingImports.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertPendingImports(
  userId: number,
  items: Array<{ term: string; translation: string; kind: "word" | "phrase"; dateKey: string; groupLabel?: string | null }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (items.length === 0) return;
  await db.insert(pendingImports).values(
    items.map((item) => ({ userId, ...item, groupLabel: item.groupLabel ?? null, status: "pending" as const }))
  );
}

export async function updatePendingImportStatus(
  id: number,
  userId: number,
  status: "accepted" | "skipped"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(pendingImports)
    .set({ status })
    .where(and(eq(pendingImports.id, id), eq(pendingImports.userId, userId)));
}

export async function bulkUpdatePendingImportsByDateKey(
  userId: number,
  dateKey: string,
  status: "accepted" | "skipped"
): Promise<PendingImport[]> {
  const db = await getDb();
  if (!db) return [];
  const items = await db
    .select()
    .from(pendingImports)
    .where(and(eq(pendingImports.userId, userId), eq(pendingImports.dateKey, dateKey), eq(pendingImports.status, "pending")));
  if (items.length > 0) {
    await db
      .update(pendingImports)
      .set({ status })
      .where(and(eq(pendingImports.userId, userId), eq(pendingImports.dateKey, dateKey), eq(pendingImports.status, "pending")));
  }
  return items;
}

export async function countPendingImports(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: pendingImports.id })
    .from(pendingImports)
    .where(and(eq(pendingImports.userId, userId), eq(pendingImports.status, "pending")));
  return rows.length;
}
