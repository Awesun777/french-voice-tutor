/**
 * probe-sources.ts — can we actually fetch and read a given French news site?
 *
 *   pnpm tsx scripts/probe-sources.ts [url ...]
 *
 * Answers the only two questions that decide whether a publisher can feed the
 * Reading tab:
 *   1. Does the fetch succeed at all, or does the site block scripts outright?
 *   2. Is the article body actually IN the HTML, or only a teaser with the rest
 *      behind a paywall?
 *
 * Deliberately does no LLM work — this is a cheap preflight to run before
 * pointing the real ingester at a source. Given a homepage it picks the first
 * article-looking link and probes that.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Phrases publishers put where the article should be. Matching one alongside a
 * short body is what separates "paywalled" from "we fetched it fine".
 */
const PAYWALL_MARKERS = [
  "réservé aux abonnés", "reserve aux abonnes", "article réservé",
  "abonnez-vous", "déjà abonné", "deja abonne", "s'abonner",
  "pour lire la suite", "lire la suite", "accès illimité", "acces illimite",
  "offre spéciale", "cet article est réservé", "soutenez un journalisme",
  "subscribe to read", "subscribers only",
];

interface Probe {
  url: string;
  status: number | string;
  htmlKb: number;
  words: number;
  paywallHits: string[];
  verdict: string;
}

function textOf(html: string): string {
  // Whole page, matching what ingest-article.ts does: it strips the entire
  // document to text and lets the model find the body. Scoping to <article>
  // first looked tidier but truncated at the first </article>, reporting 19
  // words for a 20 Minutes piece we have ingested successfully three times.
  return html
    .replace(/<(script|style|noscript|nav|header|footer|aside|form|iframe|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(s: string): number {
  return (s.match(/[A-Za-zÀ-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÿŒœÆæ]+)*/g) ?? []).length;
}

/** First link that looks like an article rather than a section index. */
function pickArticle(html: string, base: string): string | null {
  const origin = new URL(base).origin;
  for (const m of html.matchAll(/<a[^>]+href=["\']([^"\']+)["\']/gi)) {
    let abs: string;
    try { abs = new URL(m[1], base).toString(); } catch { continue; }
    if (!abs.startsWith(origin)) continue;
    const path = new URL(abs).pathname;
    // Article URLs almost always carry a long multi-word slug.
    if (path.split("/").filter(Boolean).length < 2) continue;
    if (!/[a-z]{4,}-[a-z]{4,}-[a-z]{4,}/i.test(path)) continue;
    // Index, hub and replay pages carry article-ish slugs but no body, which
    // makes a source look thinner or richer than it really is.
    if (/\/(video|videos|photo|photos|diaporama|podcast|live|replay|dossier|premium|journal|tag|tags|auteur|en-continu|direct)\//i.test(path)) continue;
    // Real articles almost always carry a date or a numeric id.
    if (!/\/(19|20)\d{2}\//.test(path) && !/\d{5,}/.test(path)) continue;
    return abs;
  }
  return null;
}

async function probe(url: string): Promise<Probe> {
  const base: Probe = { url, status: "-", htmlKb: 0, words: 0, paywallHits: [], verdict: "" };
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "fr" },
      redirect: "follow",
    });
  } catch (e: any) {
    return { ...base, status: "fetch failed", verdict: `BLOCKED — ${e?.message ?? e}` };
  }
  const html = await resp.text();
  const text = textOf(html);
  const words = countWords(text);
  const hay = text.toLowerCase();
  const paywallHits = PAYWALL_MARKERS.filter((m) => hay.includes(m));

  let verdict: string;
  if (!resp.ok) verdict = `BLOCKED — HTTP ${resp.status}`;
  else if (words >= 300) verdict = paywallHits.length ? "USABLE (paywall banner, body present)" : "USABLE";
  else if (paywallHits.length) verdict = "PAYWALLED — teaser only";
  else if (words < 120) verdict = "THIN — no readable body found";
  else verdict = "MARGINAL — short body";

  return {
    url, status: resp.status, htmlKb: Math.round(html.length / 1024),
    words, paywallHits: paywallHits.slice(0, 3), verdict,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("usage: pnpm tsx scripts/probe-sources.ts <url> [url ...]");
    process.exit(1);
  }
  for (const arg of args) {
    let target = arg;
    // A bare homepage tells us nothing about article access, so drill in.
    if (new URL(arg).pathname.replace(/\/+$/, "") === "") {
      try {
        const home = await fetch(arg, { headers: { "user-agent": UA, "accept-language": "fr" } });
        const found = pickArticle(await home.text(), arg);
        if (found) target = found;
      } catch { /* fall through and probe the homepage itself */ }
    }
    const r = await probe(target);
    const host = new URL(r.url).hostname.replace(/^www\./, "");
    console.log(
      `${host.padEnd(26)} ${String(r.status).padEnd(5)} ${String(r.htmlKb + "kb").padEnd(7)} ` +
      `${String(r.words + "w").padEnd(7)} ${r.verdict}`
    );
    if (r.paywallHits.length) console.log(`${" ".repeat(28)}markers: ${r.paywallHits.join(" | ")}`);
    console.log(`${" ".repeat(28)}${r.url.slice(0, 100)}`);
  }
}

main().catch((e) => { console.error("✗", e); process.exit(1); });
