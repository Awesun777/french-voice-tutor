/**
 * ingest-rfi-facile.ts — ingest the latest graded articles from
 * "Le français facile avec RFI" into the Reading tab's RFI section.
 *
 *   railway run -- pnpm tsx scripts/ingest-rfi-facile.ts
 *   railway run -- pnpm tsx scripts/ingest-rfi-facile.ts --per-level 3 --levels A1,B2
 *
 * RFI publishes "Comprendre l'actualité" pieces graded by CEFR level. The
 * listing page ships every level's list inline (one block per
 * data-filter-content-slug), newest first, so one fetch yields the latest
 * articles for all four grades. The per-level hub pages
 * (/fr/exercices/a1/ …) are NOT usable for this: they serve the same
 * unfiltered carousels to every level.
 *
 * Already-ingested URLs are skipped by checking articles.url first — the
 * listing shows the same pieces for weeks, and re-ingesting would re-run the
 * whole gloss pipeline for nothing. That makes this safe to run on a daily
 * schedule.
 *
 * The site's WAF rejects curl's TLS fingerprint (403 on every page) but lets
 * Node's fetch through with a browser UA, so this must run under Node — do not
 * "test" the URLs with curl and conclude the site is down.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDb } from "../server/db";
import { articles } from "../drizzle/schema";

const LISTING_URL = "https://francaisfacile.rfi.fr/fr/comprendre-actualit%C3%A9-fran%C3%A7ais/";
const SECTION = "RFI";
const DEFAULT_LEVELS = ["A1", "A2", "B1", "B2"];
const DEFAULT_PER_LEVEL = 3;
/**
 * RFI facile transcripts are deliberately short — an A1 piece is a ~60-word
 * extract of the audio (verified against the site's own transcription PDF,
 * which holds the same text) — so the ingester's 350-word teaser guard would
 * reject real articles here.
 */
const MIN_WORDS = 40;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** RFI facile article URLs are /fr/actualité/<yyyymmdd>-<slug> (percent-encoded). */
const ARTICLE_HREF = /href=["']((?:https?:\/\/francaisfacile\.rfi\.fr)?\/fr\/actualit%C3%A9\/20\d{6}-[^"'<\s]+)["']/gi;

/** The 3 latest article URLs for one level, in the page's newest-first order. */
function latestForLevel(html: string, level: string, perLevel: number): string[] {
  const marker = `data-filter-content-slug="${level.toLowerCase()}"`;
  const start = html.indexOf(marker);
  if (start === -1) return [];
  // The block runs until the next level's marker (or the end of the page).
  const next = html.indexOf("data-filter-content-slug=", start + marker.length);
  const chunk = html.slice(start, next === -1 ? undefined : next);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of chunk.matchAll(ARTICLE_HREF)) {
    const abs = new URL(m[1], "https://francaisfacile.rfi.fr").toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
    if (out.length >= perLevel) break;
  }
  return out;
}

function flag(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] ?? null : null;
}

function run(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["tsx", ...args], { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const perLevel = Number(flag(argv, "--per-level") ?? DEFAULT_PER_LEVEL);
  const levels = (flag(argv, "--levels") ?? DEFAULT_LEVELS.join(","))
    .split(",")
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);
  if (!Number.isFinite(perLevel) || perLevel < 1) throw new Error("--per-level needs a positive number");

  console.log(`• reading ${decodeURIComponent(LISTING_URL)}`);
  const resp = await fetch(LISTING_URL, {
    headers: { "user-agent": UA, "accept-language": "fr" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`listing page returned HTTP ${resp.status}`);
  const html = await resp.text();

  const wanted: { url: string; level: string }[] = [];
  for (const level of levels) {
    const urls = latestForLevel(html, level, perLevel);
    if (!urls.length) {
      console.warn(`  ${level}: no articles found — the page markup may have changed`);
      continue;
    }
    console.log(`  ${level}: ${urls.length} latest`);
    for (const url of urls) wanted.push({ url, level });
  }
  if (!wanted.length) throw new Error("no articles found for any level — the page markup may have changed");

  // Skip what is already in the feed rather than re-running the gloss pipeline.
  const db = await getDb();
  if (!db) throw new Error("no database — run under `railway run` so DATABASE_URL is set");
  const existing = new Set(
    (await db.select({ url: articles.url }).from(articles)).map((r) => r.url).filter(Boolean)
  );
  const fresh = wanted.filter((w) => !existing.has(w.url));
  console.log(`• ${wanted.length} candidates, ${wanted.length - fresh.length} already ingested, ${fresh.length} new\n`);
  if (!fresh.length) return;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const ingest = path.join(here, "ingest-article.ts");

  let ok = 0;
  const failed: string[] = [];
  for (const [i, f] of fresh.entries()) {
    console.log(`── [${i + 1}/${fresh.length}] ${f.level} ${decodeURIComponent(new URL(f.url).pathname).slice(0, 80)}`);
    const code = await run([
      ingest, f.url,
      "--level", f.level,
      "--section", SECTION,
      "--source", "RFI Français facile",
      "--min-words", String(MIN_WORDS),
    ]);
    if (code === 0) ok++;
    else failed.push(f.url);
  }

  console.log(`\n✓ ${ok}/${fresh.length} ingested into "${SECTION}"`);
  if (failed.length) {
    console.log(`  ${failed.length} failed:`);
    failed.forEach((u) => console.log(`    ${decodeURIComponent(new URL(u).pathname).slice(0, 80)}`));
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("✗", err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
