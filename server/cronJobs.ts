/**
 * Scheduled background jobs
 *
 * dailyGoogleDriveSync — runs at 8:00 AM UTC every day.
 * For every user who has a Google account connected AND a source doc URL configured,
 * fetch the doc, extract new vocabulary, and queue it as pending imports.
 */
import cron from "node-cron";
import { getDb } from "./db";
import {
  getGoogleDriveSettings,
  getGoogleAccountByUserId,
  getVocabByUser,
  getPendingImports,
  insertPendingImports,
  upsertGoogleDriveSettings,
} from "./db";
import {
  extractDocId,
  extractVocabFromText,
  fetchGoogleDocText,
  getValidAccessToken,
} from "./googleDrive";
import { googleAccounts, googleDriveSettings } from "../drizzle/schema";

async function syncUserDrive(userId: number): Promise<{ found: number }> {
  try {
    const settings = await getGoogleDriveSettings(userId);
    if (!settings?.sourceDocUrl) return { found: 0 };

    const docId = extractDocId(settings.sourceDocUrl);
    if (!docId) return { found: 0 };

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch {
      console.warn(`[DailySync] User ${userId}: Google token unavailable, skipping`);
      return { found: 0 };
    }

    const docText = await fetchGoogleDocText(docId, accessToken);

    const existingVocab = await getVocabByUser(userId);
    const normalize = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const existingTerms = new Set(existingVocab.map((v) => normalize(v.term)));

    const pending = await getPendingImports(userId);
    for (const p of pending) existingTerms.add(normalize(p.term));

    const extracted = await extractVocabFromText(docText, existingTerms);

    if (extracted.length > 0) {
      const dateKey = new Date().toISOString().split("T")[0];
      await insertPendingImports(
        userId,
        extracted.map((e) => ({ ...e, dateKey }))
      );
    }

    await upsertGoogleDriveSettings(userId, { lastSyncedAt: Date.now() });

    return { found: extracted.length };
  } catch (err) {
    console.error(`[DailySync] User ${userId} sync failed:`, err);
    return { found: 0 };
  }
}

export function startCronJobs() {
  // Run daily at 8:00 AM UTC
  cron.schedule("0 8 * * *", async () => {
    console.log("[DailySync] Starting daily Google Drive sync…");

    const db = await getDb();
    if (!db) {
      console.warn("[DailySync] DB unavailable, skipping");
      return;
    }

    // Find all users who have both a Google account and a source doc URL
    const settingsRows = await db
      .select({ userId: googleDriveSettings.userId, sourceDocUrl: googleDriveSettings.sourceDocUrl })
      .from(googleDriveSettings);

    const accountRows = await db
      .select({ userId: googleAccounts.userId })
      .from(googleAccounts);

    const connectedUserIds = new Set(accountRows.map((r) => r.userId));

    const usersToSync = settingsRows.filter(
      (s) => s.sourceDocUrl && connectedUserIds.has(s.userId)
    );

    console.log(`[DailySync] Syncing ${usersToSync.length} user(s)…`);

    let totalFound = 0;
    for (const { userId } of usersToSync) {
      const result = await syncUserDrive(userId);
      totalFound += result.found;
      if (result.found > 0) {
        console.log(`[DailySync] User ${userId}: found ${result.found} new word(s)`);
      }
    }

    console.log(`[DailySync] Done. Total new words queued: ${totalFound}`);
  });

  console.log("[CronJobs] Daily Google Drive sync scheduled at 08:00 UTC");
}
