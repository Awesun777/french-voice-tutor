/**
 * ingest-worker.ts — drain the Listening Lab ingest queue on a local machine.
 *
 *   railway run -- npx tsx scripts/ingest-worker.ts
 *
 * The dashboard (IngestTab) writes job rows; this worker claims them one at a
 * time and shells out to the existing ingest-video.ts for each — the pipeline
 * itself is untouched, this is just hands for it. Runs locally on purpose:
 * YouTube bot-blocks datacentre IPs, so the download must come from a
 * residential connection. Scheduled every 5 minutes by a LaunchAgent; each
 * run drains everything pending, then exits.
 *
 * Crash-safety: a job is claimed by an optimistic UPDATE (pending → running),
 * so two overlapping workers can't both take it — and any job stuck "running"
 * for over 2 h is presumed orphaned by a crash and marked failed so it can be
 * retried from the dashboard.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, lt } from "drizzle-orm";

import { getDb } from "../server/db";
import { ingestJobs, jobRuns, videoLessons } from "../drizzle/schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const STALE_MS = 2 * 60 * 60 * 1000;
/** ingest-video.ts on a long video: download + chunked Whisper + glossing. */
const JOB_TIMEOUT_MS = 90 * 60 * 1000;

function run(url: string, level: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", "scripts/ingest-video.ts", url, "--level", level],
      { cwd: REPO, timeout: JOB_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, env: process.env },
      (err, stdout, stderr) => {
        resolve({ ok: !err, output: `${stdout}\n${stderr}`.trim() });
      }
    );
  });
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable — run under `railway run`");

  // Orphan sweep before draining.
  await db
    .update(ingestJobs)
    .set({ status: "failed", error: "worker crashed or was interrupted — retry from the dashboard", finishedAt: Date.now() })
    .where(and(eq(ingestJobs.status, "running"), lt(ingestJobs.startedAt, Date.now() - STALE_MS)));

  // Heartbeat row only when there is actual work — an empty drain every five
  // minutes would bury the Ops tab's run feed in noise.
  let runId: number | null = null;
  let processed = 0;
  let failures = 0;
  const detailLines: string[] = [];

  for (;;) {
    const pending = await db.select().from(ingestJobs).where(eq(ingestJobs.status, "pending"));
    const job = pending.sort((a, b) => a.requestedAt - b.requestedAt)[0];
    if (!job) break;

    if (runId === null) {
      const [hb]: any = await db.insert(jobRuns).values({ job: "ingest-worker", status: "running", startedAt: Date.now() });
      runId = hb.insertId ?? 0;
    }

    // Optimistic claim — only one worker wins this row.
    const [claim]: any = await db
      .update(ingestJobs)
      .set({ status: "running", startedAt: Date.now() })
      .where(and(eq(ingestJobs.id, job.id), eq(ingestJobs.status, "pending")));
    if (!claim || claim.affectedRows === 0) continue;

    console.log(`▶ #${job.id} ${job.url} (${job.level})`);
    const { ok, output } = await run(job.url, job.level);

    if (ok) {
      // The pipeline prints "✓ <title>" on success; the lesson row is the
      // ground truth for the dashboard's title either way.
      const [lesson] = await db.select().from(videoLessons).where(eq(videoLessons.youtubeId, job.youtubeId));
      await db
        .update(ingestJobs)
        .set({
          status: "done",
          title: lesson?.title ?? output.match(/✓ (.+)/)?.[1] ?? null,
          // For "auto" jobs this is where the AI's grade becomes visible.
          level: lesson?.level ?? job.level,
          costCents,
          finishedAt: Date.now(),
          error: null,
        })
        .where(eq(ingestJobs.id, job.id));
      processed++;
      const cost = output.match(/^COST_USD=([\d.]+)$/m)?.[1];
      const costCents = cost ? Math.round(parseFloat(cost) * 100) : null;
      detailLines.push(`« ${lesson?.title ?? job.youtubeId} »${lesson?.level ? ` · ${lesson.level}` : ""}${cost ? ` · ~$${parseFloat(cost).toFixed(2)}` : ""} · ok`);
      console.log(`✓ #${job.id} done`);
    } else {
      const tail = output.slice(-600);
      await db
        .update(ingestJobs)
        .set({ status: "failed", error: tail.split("\n").slice(-4).join(" · ").slice(0, 500), finishedAt: Date.now() })
        .where(eq(ingestJobs.id, job.id));
      processed++;
      failures++;
      detailLines.push(`« ${job.title ?? job.youtubeId} » · FAILED`);
      console.log(`✗ #${job.id} failed:\n${tail}`);
    }
  }

  if (runId !== null) {
    await db.update(jobRuns)
      .set({
        status: failures > 0 ? "failed" : "ok",
        summary: `${processed - failures} video${processed - failures === 1 ? "" : "s"} ingested${failures ? `, ${failures} failed` : ""}`,
        detail: detailLines.join("\n") || null,
        finishedAt: Date.now(),
      })
      .where(eq(jobRuns.id, runId));
  }

  console.log("queue drained");
  process.exit(0);
}

main().catch((e) => {
  console.error("worker error:", e);
  process.exit(1);
});
