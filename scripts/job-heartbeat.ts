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
import { eq, gte } from "drizzle-orm";
import { getDb } from "../server/db";
import { articles, jobRuns } from "../drizzle/schema";

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
    let summary = rest.slice(2).join(" ").slice(0, 480) || null;
    if (!id) throw new Error("usage: finish <run-id> <ok|failed> [summary]");

    // For the article fetch, ground truth beats any message the shell could
    // pass: everything that landed in `articles` during this run's window IS
    // what the run produced — titles and sources included.
    const [run] = await db.select().from(jobRuns).where(eq(jobRuns.id, id));
    let detail: string | null = null;
    if (run?.job === "daily-articles") {
      const added = await db.select().from(articles).where(gte(articles.addedAt, run.startedAt));
      detail = added.length
        ? added.map((a) => `« ${a.title} » · ${a.source ?? "?"}${a.level ? ` · ${a.level}` : ""}`).join("\n").slice(0, 60000)
        : null;
      summary = `${added.length} new article${added.length === 1 ? "" : "s"}${summary ? ` · ${summary}` : ""}`.slice(0, 500);
    }

    await db.update(jobRuns).set({ status, summary, detail, finishedAt: Date.now() }).where(eq(jobRuns.id, id));
  } else {
    throw new Error(`unknown command ${JSON.stringify(cmd)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("heartbeat error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
