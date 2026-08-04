/**
 * ingest-france24-section.ts — ingest the top stories off a France 24 section page.
 *
 *   railway run -- pnpm tsx scripts/ingest-france24-section.ts \
 *     "https://www.france24.com/fr/france/" --section "France 24 · France" --top 4
 *
 *   railway run -- pnpm tsx scripts/ingest-france24-section.ts \
 *     "https://www.france24.com/fr/éco-tech/" --section "France 24 · Éco & Tech" --until "Nos émissions"
 *
 * Reads the section page in DOM order, which is EDITORIAL order — the page's
 * own idea of its top reads. Deliberately not the RSS feed: RSS is
 * chronological, so the newest wire item outranks the piece the desk actually
 * led with.
 *
 * `--until` cuts the list at a section heading ("Nos émissions"), taking only
 * what appears above it. The phrase also occurs in the site nav long before any
 * article, so the cut uses the LAST occurrence before the first article link
 * rather than the first occurrence anywhere.
 *
 * Delegates each article to ingest-article.ts rather than duplicating the
 * fetch/gloss pipeline.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** France 24 article URLs are /fr/<section>/<yyyymmdd>-<slug>. */
const ARTICLE_HREF = /href=["']((?:https?:\/\/www\.france24\.com)?\/fr\/[^"'<\s]*\/20\d{6}-[^"'<\s]+)["']/gi;

interface Found { url: string; at: number }

function articlesInOrder(html: string): Found[] {
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const m of html.matchAll(ARTICLE_HREF)) {
    const abs = new URL(m[1], "https://www.france24.com").toString();
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ url: abs, at: m.index ?? 0 });
  }
  return out;
}

/**
 * Offset of the heading that ends the editorial list. Returns Infinity when the
 * phrase never appears below the first article, so nothing is cut by accident.
 */
function cutAt(html: string, phrase: string, firstArticleAt: number): number {
  const hay = html.toLowerCase();
  const needle = phrase.toLowerCase();
  let at = hay.indexOf(needle);
  while (at !== -1) {
    if (at > firstArticleAt) return at;
    at = hay.indexOf(needle, at + needle.length);
  }
  return Infinity;
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
  const pageUrl = argv.find((a) => /^https?:\/\//i.test(a));
  const section = flag(argv, "--section");
  const level = flag(argv, "--level") ?? "B2";
  const until = flag(argv, "--until");
  const top = Number(flag(argv, "--top") ?? 0);

  if (!pageUrl || !section) {
    console.error('usage: tsx scripts/ingest-france24-section.ts <section-url> --section "France 24 · France" [--top 4] [--until "Nos émissions"] [--level B2]');
    process.exit(1);
  }

  console.log(`• reading ${pageUrl}`);
  const resp = await fetch(pageUrl, {
    headers: { "user-agent": UA, "accept-language": "fr" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`section page returned HTTP ${resp.status}`);
  const html = await resp.text();

  let found = articlesInOrder(html);
  if (!found.length) throw new Error("no article links found — the page markup may have changed");
  console.log(`  ${found.length} article links in editorial order`);

  if (until) {
    const cut = cutAt(html, until, found[0].at);
    const before = found.length;
    found = found.filter((f) => f.at < cut);
    console.log(
      cut === Infinity
        ? `  "${until}" not found below the articles — keeping all ${before}`
        : `  cut at "${until}": ${found.length} of ${before} sit above it`
    );
  }
  if (top > 0) found = found.slice(0, top);

  console.log(`• ingesting ${found.length} into "${section}"\n`);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const ingest = path.join(here, "ingest-article.ts");

  let ok = 0;
  const failed: string[] = [];
  for (const [i, f] of found.entries()) {
    console.log(`── [${i + 1}/${found.length}] ${decodeURIComponent(new URL(f.url).pathname).slice(0, 90)}`);
    const code = await run([ingest, f.url, "--level", level, "--section", section]);
    if (code === 0) ok++;
    else failed.push(f.url);
  }

  console.log(`\n✓ ${ok}/${found.length} ingested into "${section}"`);
  // Video and show pages live in the same list and have almost no body text;
  // they fail the ingester's own checks rather than being guessed at here.
  if (failed.length) {
    console.log(`  ${failed.length} failed (likely video/show pages with no article body):`);
    failed.forEach((u) => console.log(`    ${decodeURIComponent(new URL(u).pathname).slice(0, 90)}`));
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
