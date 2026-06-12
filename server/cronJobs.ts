/**
 * Scheduled background jobs
 *
 * dailyGoogleDriveSync — runs at 8:00 AM UTC every day.
 * Syncs users who opted in via autoSyncFrequency ('daily' or 'weekly') in the
 * Drive panel. Uses the exact same pipeline as the manual Sync Now button
 * (style-aware date headers, section-hash skipping, dedup); since nobody is
 * present to answer the year prompt, year-less date headers are assumed to be
 * the current year — words still land in the pending review queue where the
 * user can fix dates before accepting.
 */
import cron from "node-cron";
import { getDb } from "./db";
import { runSync } from "./googleSyncStream";
import { googleAccounts, googleDriveSettings } from "../drizzle/schema";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

export function startCronJobs() {
  // Run daily at 8:00 AM UTC
  cron.schedule("0 8 * * *", async () => {
    console.log("[AutoSync] Starting scheduled Google Drive sync…");

    const db = await getDb();
    if (!db) {
      console.warn("[AutoSync] DB unavailable, skipping");
      return;
    }

    const settingsRows = await db
      .select({
        userId: googleDriveSettings.userId,
        sourceDocUrl: googleDriveSettings.sourceDocUrl,
        autoSyncFrequency: googleDriveSettings.autoSyncFrequency,
        lastSyncedAt: googleDriveSettings.lastSyncedAt,
      })
      .from(googleDriveSettings);

    const accountRows = await db
      .select({ userId: googleAccounts.userId })
      .from(googleAccounts);
    const connectedUserIds = new Set(accountRows.map((r) => r.userId));

    const now = Date.now();
    const usersToSync = settingsRows.filter((s) => {
      if (!s.sourceDocUrl || !connectedUserIds.has(s.userId)) return false;
      if (s.autoSyncFrequency === "daily") return true;
      if (s.autoSyncFrequency === "weekly") {
        return !s.lastSyncedAt || now - s.lastSyncedAt >= SIX_DAYS_MS;
      }
      return false; // 'off'
    });

    console.log(`[AutoSync] Syncing ${usersToSync.length} user(s)…`);

    let totalFound = 0;
    for (const { userId } of usersToSync) {
      try {
        const result = await runSync(userId, new Date().getFullYear(), () => {});
        totalFound += result.found;
        if (result.found > 0) {
          console.log(`[AutoSync] User ${userId}: found ${result.found} new word(s)`);
        }
      } catch (err) {
        console.error(`[AutoSync] User ${userId} sync failed:`, err);
      }
    }

    console.log(`[AutoSync] Done. Total new words queued: ${totalFound}`);
  });

  console.log("[CronJobs] Scheduled Google Drive auto-sync tick at 08:00 UTC");
}
