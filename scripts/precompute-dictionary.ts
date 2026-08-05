/**
 * precompute-dictionary.ts — warm dict_cache ahead of time.
 *
 *   railway run -- pnpm tsx scripts/precompute-dictionary.ts --dry-run
 *   railway run -- pnpm tsx scripts/precompute-dictionary.ts --yes
 *   railway run -- pnpm tsx scripts/precompute-dictionary.ts --from 500 --to 3000 --yes
 *   railway run -- pnpm tsx scripts/precompute-dictionary.ts --from-corpus --yes
 *
 * A dictionary lookup is slow because of one thing: generating ~350 output
 * tokens of structured JSON. Nothing at request time fixes that — but the cache
 * is shared across every user, so the work only ever has to happen once. Doing
 * it in advance turns the common case from an LLM call into a table read.
 *
 * Entries are generated at `parts: "full"`, deliberately. The search resolver
 * resolves a "meaning" or "quick" request from a cached "full" entry, so one
 * generation warms all three variants.
 *
 * Runs through the real tRPC procedure rather than a copy of the prompt, so
 * precomputed entries are byte-identical to live ones and can never drift.
 *
 * Requires DATABASE_URL + OPENAI_API_KEY (which `railway run` supplies).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "../server/db";
import { appRouter } from "../server/routers";
import { articleBlocks, dictCache } from "../drizzle/schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LIST = path.join(HERE, "data", "fr-frequent.txt");

/**
 * Rank window, not "top N". The most frequent French words are the ones a
 * learner already knows — nobody looks up "de" or "je". The words worth having
 * warm are common enough to turn up in an article but not yet known, which is
 * roughly the 500–6000 band. Widen it with --from/--to.
 */
const DEFAULT_FROM = 500;
const DEFAULT_TO = 6000;

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Words actually used in the articles already ingested, most frequent first. */
async function fromCorpus(): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db.select({ text: articleBlocks.text }).from(articleBlocks);
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const raw of (r.text ?? "").toLowerCase().split(/[^a-zàâäçéèêëîïôöùûüÿœæ'-]+/i)) {
      const w = raw.replace(/^['-]+|['-]+$/g, "");
      if (w.length < 2) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

async function fromList(file: string, from: number, to: number): Promise<string[]> {
  const text = await readFile(file, "utf8");
  const words = text.split("\n").map((w) => w.trim()).filter(Boolean);
  return words.slice(Math.max(0, from - 1), to);
}

/**
 * One bulk read of the existing keys instead of a lookup per word. On a list of
 * thousands this is the difference between one query and thousands of them.
 */
async function alreadyCached(tolerateNoDb: boolean): Promise<Set<string>> {
  try {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const rows = await db.select({ termKey: dictCache.termKey }).from(dictCache);
    return new Set(rows.map((r) => r.termKey));
  } catch (err) {
    // A dry run is worth being able to do on a laptop with no DATABASE_URL —
    // it just can't tell you what's already warm.
    if (!tolerateNoDb) throw err;
    console.warn("! No database reachable — preview only, cannot tell what is already cached.\n");
    return new Set();
  }
}

async function main() {
  const from = Number(arg("from", String(DEFAULT_FROM)));
  const to = Number(arg("to", String(DEFAULT_TO)));
  const limit = Number(arg("limit", "0"));
  const concurrency = Math.max(1, Number(arg("concurrency", "4")));
  const dryRun = flag("dry-run");

  let words = flag("from-corpus")
    ? await fromCorpus()
    : await fromList(arg("file", DEFAULT_LIST)!, from, to);

  const cached = await alreadyCached(dryRun);
  // "full" entries are keyed with no suffix; that is the one we generate.
  const pending = words.filter((w) => !cached.has(`v2::${w.toLowerCase().trim()}`));
  const todo = limit > 0 ? pending.slice(0, limit) : pending;

  const source = flag("from-corpus") ? "ingested articles" : `${path.basename(arg("file", DEFAULT_LIST)!)} ranks ${from}–${to}`;
  console.log(`Source:     ${source}`);
  console.log(`Candidates: ${words.length}`);
  console.log(`Already warm: ${words.length - pending.length}`);
  console.log(`To generate: ${todo.length}  (concurrency ${concurrency})`);
  // Rough, but enough to notice if a flag typo is about to cost real money.
  console.log(`Est. cost:  ~$${((todo.length * 750) / 1_000_000 * 0.6).toFixed(2)} at gpt-4o-mini rates`);

  if (dryRun) {
    console.log(`\nDry run — nothing generated. First 20:\n  ${todo.slice(0, 20).join(", ")}`);
    process.exit(0);
  }
  if (!todo.length) {
    console.log("\nNothing to do.");
    process.exit(0);
  }
  if (!flag("yes")) {
    console.log("\nRe-run with --yes to generate. (--dry-run to preview.)");
    process.exit(0);
  }

  // The search resolver never touches ctx, but protectedProcedure requires a
  // user to be present, so a stub is enough to call it out of band.
  const caller = appRouter.createCaller({ req: {} as any, res: {} as any, user: { id: 0 } as any });

  let done = 0;
  let failed = 0;
  const started = Date.now();
  const queue = [...todo];

  async function worker() {
    for (;;) {
      const word = queue.shift();
      if (!word) return;
      try {
        await caller.dictionary.search({ term: word, parts: "full" });
      } catch (err) {
        failed++;
        console.error(`  ✗ ${word}: ${err instanceof Error ? err.message : err}`);
      }
      done++;
      if (done % 25 === 0 || done === todo.length) {
        const rate = done / ((Date.now() - started) / 1000);
        const left = Math.round((todo.length - done) / Math.max(rate, 0.01));
        console.log(`  ${done}/${todo.length}  ${rate.toFixed(1)}/s  ~${left}s left`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  console.log(`\n✓ ${done - failed} cached, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s`);
  process.exit(0);
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((err) => {
    console.error("✗", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
