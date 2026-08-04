/**
 * backfill-title-en.ts — fill articles.titleEn for pieces ingested before the
 * front page started showing an English headline.
 *
 *   railway run -- pnpm tsx scripts/backfill-title-en.ts [--force]
 *
 * Headline only, in one batched call — re-ingesting whole articles just to get
 * a translated headline would cost a full gloss pass each and rewrite rows that
 * are already correct.
 */
import { isNull, eq } from "drizzle-orm";

import { getDb } from "../server/db";
import { invokeLLM } from "../server/_core/llm";
import { articles } from "../drizzle/schema";

const SCHEMA = {
  type: "object",
  properties: {
    titles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          titleEn: { type: "string" },
        },
        required: ["id", "titleEn"],
        additionalProperties: false,
      },
    },
  },
  required: ["titles"],
  additionalProperties: false,
} as const;

/** Small enough that the model reliably returns every line it was given. */
const PER_BATCH = 10;

async function translate(rows: { id: number; title: string }[]) {
  const listed = rows.map((r) => `${r.id}. ${r.title}`).join("\n");
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You translate French news headlines for English-speaking learners. " +
          "Return only valid JSON matching the schema exactly.",
      },
      {
        role: "user",
        content:
          `French headlines, each prefixed by its id:\n"""\n${listed}\n"""\n\n` +
          `For EACH id return "titleEn": that headline in natural English — what the ` +
          `piece is ABOUT, so a reader can decide whether to read it. Not a literal ` +
          `word-for-word rendering. Keep it to one line, no trailing full stop unless ` +
          `the headline is a question. Return every id you were given.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "headline_translations", strict: true, schema: SCHEMA },
    } as never,
  });
  const raw = response.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    return (parsed.titles ?? []) as { id: number; titleEn: string }[];
  } catch {
    return [];
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const db = await getDb();
  if (!db) throw new Error("No DATABASE_URL — run under `railway run --`");

  const all = await db.select().from(articles);
  const todo = all
    .filter((a) => force || !a.titleEn?.trim())
    .map((a) => ({ id: a.id, title: a.title }));

  if (!todo.length) {
    console.log("✓ every article already has an English headline");
    return;
  }
  console.log(`• translating ${todo.length} headline${todo.length > 1 ? "s" : ""}`);

  let done = 0;
  const missed: number[] = [];
  for (let i = 0; i < todo.length; i += PER_BATCH) {
    const batch = todo.slice(i, i + PER_BATCH);
    const got = await translate(batch);
    const byId = new Map(got.map((g) => [g.id, g.titleEn]));
    for (const row of batch) {
      const en = byId.get(row.id)?.trim();
      if (!en) { missed.push(row.id); continue; }
      await db.update(articles).set({ titleEn: en }).where(eq(articles.id, row.id));
      console.log(`  ${row.title.slice(0, 54)}\n    → ${en.slice(0, 70)}`);
      done++;
    }
  }

  console.log(`\n✓ ${done}/${todo.length} headlines translated`);
  // Same short-return failure the cue breakdowns hit; worth naming rather than
  // leaving as a silent gap in the feed.
  if (missed.length) console.log(`  ${missed.length} came back missing — re-run to retry: ${missed.join(", ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
