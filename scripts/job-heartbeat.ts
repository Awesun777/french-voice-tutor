/**
 * job-heartbeat.ts — run records for the local scheduled jobs.
 *
 *   railway run -- npx tsx scripts/job-heartbeat.ts start <job-name>
 *     → prints the run id (capture it)
 *   railway run -- npx tsx scripts/job-heartbeat.ts finish <run-id> <ok|failed> [summary…]
 *
 * The Ops tab reads these rows. Shell scripts that can't import the DB layer
 * (daily-articles.sh) call this CLI; TypeScript jobs (ingest-worker) write
 * their rows directly.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { jobRuns } from "../drizzle/schema";

const [, , cmd, ...rest] = process.argv;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable — run under `railway run`");

  if (cmd === "start") {
    const job = rest[0];
    if (!job) throw new Error("usage: start <job-name>");
    const [res]: any = await db.insert(jobRuns).values({ job, status: "running", startedAt: Date.now() });
    // Only the id on stdout, so shell capture stays trivial.
    console.log(res.insertId ?? 0);
  } else if (cmd === "finish") {
    const id = Number(rest[0]);
    const status = rest[1] === "failed" ? "failed" : "ok";
    const summary = rest.slice(2).join(" ").slice(0, 500) || null;
    if (!id) throw new Error("usage: finish <run-id> <ok|failed> [summary]");
    await db.update(jobRuns).set({ status, summary, finishedAt: Date.now() }).where(eq(jobRuns.id, id));
  } else {
    throw new Error(`unknown command ${JSON.stringify(cmd)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("heartbeat error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
