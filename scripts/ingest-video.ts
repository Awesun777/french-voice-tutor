/**
 * ingest-video.ts — curate a YouTube video into a timed, glossed lesson.
 *
 *   railway run -- pnpm tsx scripts/ingest-video.ts <youtube-url> [--level B1]
 *
 * Runs locally on purpose. YouTube bot-blocks datacentre IPs hard, so pulling
 * audio from Railway is unreliable; from a residential connection it just works.
 * Running ahead of time also means the app never transcribes at request time —
 * it only reads pre-computed rows, which is what makes hovering instant and
 * keeps the LLM cost at one pass per video rather than one per view.
 *
 * Requires `yt-dlp` and `ffmpeg` on PATH, and DATABASE_URL + OPENAI_API_KEY in
 * the environment (which `railway run` supplies).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";

import { getDb } from "../server/db";
import { invokeLLM } from "../server/_core/llm";
import { videoLessons, videoCues, dictCache } from "../drizzle/schema";

const exec = promisify(execFile);

/** OpenAI rejects transcription uploads over 25 MB. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Chunk length when an audio file is too large to send in one piece. */
const CHUNK_SECONDS = 600;
/** Cues per gloss request — small enough to keep each response well-formed. */
const CUES_PER_GLOSS_BATCH = 25;
/** Matches googleDrive.ts's batch concurrency. */
const GLOSS_CONCURRENCY = 3;

/** French-aware word matcher: letters plus internal apostrophes and hyphens. */
const WORD_RE = /[A-Za-zÀ-ÿ]+(?:['’-][A-Za-zÀ-ÿ]+)*/g;

interface WhisperWord { word: string; start: number; end: number }
interface WhisperSegment { start: number; end: number; text: string }
interface Token {
  s: number;
  e: number;
  surface: string;
  lemma?: string;
  gloss: string;
  kind: "word" | "expression";
  tMs?: number;
}
interface Cue { idx: number; startMs: number; endMs: number; text: string; tokens: Token[] }

// ─── yt-dlp ───────────────────────────────────────────────────────────────────

interface VideoMeta {
  id: string;
  title: string;
  channel: string | null;
  durationSec: number;
  thumbnailUrl: string | null;
}

async function fetchMeta(url: string): Promise<VideoMeta> {
  const { stdout } = await exec("yt-dlp", ["--dump-json", "--no-warnings", url], {
    maxBuffer: 32 * 1024 * 1024,
  });
  const j = JSON.parse(stdout);
  if (!j.id) throw new Error("yt-dlp returned no video id");
  return {
    id: j.id,
    title: j.title ?? j.id,
    channel: j.channel ?? j.uploader ?? null,
    durationSec: Math.round(j.duration ?? 0),
    thumbnailUrl: j.thumbnail ?? null,
  };
}

async function downloadAudio(url: string, dir: string): Promise<string> {
  const out = path.join(dir, "audio.%(ext)s");
  // m4a keeps the file small and is a format Whisper accepts directly, so there
  // is no transcode step unless the file also needs splitting.
  await exec("yt-dlp", ["-f", "bestaudio[ext=m4a]/bestaudio", "-o", out, "--no-warnings", url], {
    maxBuffer: 32 * 1024 * 1024,
  });
  const files = await readdir(dir);
  const audio = files.find((f) => f.startsWith("audio."));
  if (!audio) throw new Error("yt-dlp produced no audio file");
  return path.join(dir, audio);
}

/**
 * Split into <=CHUNK_SECONDS pieces when the file exceeds Whisper's upload
 * limit. Returns each chunk with the offset that must be added back to its
 * timestamps — without this every chunk after the first restarts at zero and
 * the whole transcript silently collapses onto the opening minutes.
 */
async function toChunks(file: string, dir: string): Promise<{ file: string; offsetSec: number }[]> {
  if (statSync(file).size <= MAX_UPLOAD_BYTES) return [{ file, offsetSec: 0 }];

  const pattern = path.join(dir, "chunk-%03d.m4a");
  await exec("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", file,
    "-f", "segment", "-segment_time", String(CHUNK_SECONDS),
    "-c:a", "aac", "-b:a", "64k", "-vn",
    "-reset_timestamps", "1",
    pattern,
  ]);
  const chunks = (await readdir(dir)).filter((f) => f.startsWith("chunk-")).sort();
  if (!chunks.length) throw new Error("ffmpeg produced no chunks");
  console.log(`  split into ${chunks.length} chunks of ${CHUNK_SECONDS}s`);
  return chunks.map((f, i) => ({ file: path.join(dir, f), offsetSec: i * CHUNK_SECONDS }));
}

// ─── Whisper ──────────────────────────────────────────────────────────────────

/**
 * whisper-1 with word AND segment granularity. gpt-4o-transcribe — what the
 * Listening Lab uses today — cannot return timestamps in any format, which is
 * why nothing in that tab is timed.
 */
async function transcribeChunk(
  file: string,
  offsetSec: number
): Promise<{ segments: WhisperSegment[]; words: WhisperWord[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(await readFile(file))]), path.basename(file));
  form.append("model", "whisper-1");
  form.append("language", "fr");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("timestamp_granularities[]", "word");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Whisper failed: ${(await resp.text()).slice(0, 300)}`);

  const data = (await resp.json()) as { segments?: WhisperSegment[]; words?: WhisperWord[] };
  const shift = <T extends { start: number; end: number }>(x: T): T => ({
    ...x,
    start: x.start + offsetSec,
    end: x.end + offsetSec,
  });
  return {
    segments: (data.segments ?? []).map(shift),
    words: (data.words ?? []).map(shift),
  };
}

// ─── Tokenising and glossing ──────────────────────────────────────────────────

interface GlossPayload {
  glosses: { surface: string; lemma: string; gloss: string }[];
  expressions: { phrase: string; gloss: string }[];
}

const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    glosses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          surface: { type: "string" },
          lemma: { type: "string" },
          gloss: { type: "string" },
        },
        required: ["surface", "lemma", "gloss"],
        additionalProperties: false,
      },
    },
    expressions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phrase: { type: "string" },
          gloss: { type: "string" },
        },
        required: ["phrase", "gloss"],
        additionalProperties: false,
      },
    },
  },
  required: ["glosses", "expressions"],
  additionalProperties: false,
};

async function glossBatch(text: string): Promise<GlossPayload> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You help English speakers read French. Return only valid JSON matching the schema exactly.",
      },
      {
        role: "user",
        content:
          `French transcript excerpt:\n"""${text}"""\n\n` +
          `1) "glosses": for every distinct French word above, give its dictionary form ` +
          `("lemma") and a concise English meaning as used here ("gloss", 1-5 words). ` +
          `Copy "surface" exactly as it appears, accents preserved.\n` +
          `2) "expressions": idiomatic multi-word expressions of 2-5 words that appear ` +
          `VERBATIM above and whose meaning is NOT obvious from the individual words — ` +
          `e.g. "pour être honnête", "il y a", "tout à fait", "avoir besoin de". ` +
          `Do NOT list ordinary noun phrases or verb+object pairs that translate word by ` +
          `word. Copy each phrase exactly as it appears.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "transcript_glosses", strict: true, schema: GLOSS_SCHEMA },
    } as never,
  });

  const raw = response.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    return { glosses: parsed.glosses ?? [], expressions: parsed.expressions ?? [] };
  } catch {
    // A malformed batch costs a few missing glosses, not the whole ingest.
    return { glosses: [], expressions: [] };
  }
}

/**
 * Lay tokens over one cue: expressions first (longest first, so the longer
 * idiom wins when two overlap), then any word not already covered. Expressions
 * become a single span so they render with one continuous underline and one
 * hover card rather than one per word.
 */
function buildTokens(
  text: string,
  glossBy: Map<string, { lemma: string; gloss: string }>,
  expressions: { phrase: string; gloss: string }[],
  words: WhisperWord[],
  cueStartMs: number
): Token[] {
  const claimed: Token[] = [];
  const overlaps = (s: number, e: number) => claimed.some((t) => s < t.e && e > t.s);
  const lower = text.toLowerCase();

  for (const { phrase, gloss } of [...expressions].sort((a, b) => b.phrase.length - a.phrase.length)) {
    const needle = phrase.toLowerCase().trim();
    if (needle.length < 3) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      // Require whole-token boundaries so "il y a" doesn't match inside a word.
      const before = at === 0 || !/[A-Za-zÀ-ÿ]/.test(text[at - 1]);
      const after = end === text.length || !/[A-Za-zÀ-ÿ]/.test(text[end]);
      if (before && after && !overlaps(at, end)) {
        claimed.push({ s: at, e: end, surface: text.slice(at, end), gloss, kind: "expression" });
      }
      from = at + needle.length;
    }
  }

  // Whisper's word list is in spoken order, so consume it in step with the
  // cue's own word order to attach a start time to each.
  let wordCursor = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    const surface = m[0];
    const w = words[wordCursor];
    const tMs = w ? Math.round(w.start * 1000) : undefined;
    wordCursor++;
    if (overlaps(s, e)) continue;
    const g = glossBy.get(surface.toLowerCase());
    claimed.push({
      s, e, surface,
      lemma: g?.lemma && g.lemma.toLowerCase() !== surface.toLowerCase() ? g.lemma : undefined,
      gloss: g?.gloss ?? "",
      kind: "word",
      tMs: tMs !== undefined ? Math.max(tMs, cueStartMs) : undefined,
    });
  }

  return claimed.sort((a, b) => a.s - b.s);
}

// ─── dict_cache (same table the dictionary uses; global, no TTL) ──────────────

async function cachedGloss(key: string): Promise<GlossPayload | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dictCache).where(eq(dictCache.termKey, key));
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].entryJson); } catch { return null; }
}

async function putGloss(key: string, value: GlossPayload) {
  const db = await getDb();
  if (!db) return;
  await db.insert(dictCache)
    .values({ termKey: key, entryJson: JSON.stringify(value), createdAt: Date.now() })
    .onDuplicateKeyUpdate({ set: { entryJson: JSON.stringify(value), createdAt: Date.now() } });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/** Fail with something actionable rather than `spawn yt-dlp ENOENT`. */
async function preflight() {
  const missing: string[] = [];
  // ffmpeg wants a single dash; --version exits non-zero and looks like a
  // missing binary.
  for (const [bin, flag] of [["yt-dlp", "--version"], ["ffmpeg", "-version"]] as const) {
    try {
      await exec(bin, [flag]);
    } catch {
      missing.push(bin);
    }
  }
  if (missing.length) {
    throw new Error(
      `missing on PATH: ${missing.join(", ")}\n  install with:  brew install ${missing.join(" ")}`
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set — run this under `railway run --`");
  }
}

async function main() {
  const [url, ...rest] = process.argv.slice(2);
  if (!url) {
    console.error("usage: tsx scripts/ingest-video.ts <youtube-url> [--level B1]");
    console.error("  run under `railway run --` so DATABASE_URL and OPENAI_API_KEY are set");
    process.exit(1);
  }
  await preflight();
  const levelIdx = rest.indexOf("--level");
  const level = levelIdx >= 0 ? rest[levelIdx + 1] ?? null : null;

  const db = await getDb();
  if (!db) throw new Error("No DATABASE_URL — run under `railway run --`");

  const dir = await mkdtemp(path.join(tmpdir(), "ingest-"));
  try {
    console.log("• fetching metadata");
    const meta = await fetchMeta(url);
    console.log(`  ${meta.title} — ${meta.durationSec}s`);

    console.log("• downloading audio");
    const audio = await downloadAudio(url, dir);
    const chunks = await toChunks(audio, dir);

    console.log("• transcribing (whisper-1, word timestamps)");
    const segments: WhisperSegment[] = [];
    const allWords: WhisperWord[] = [];
    for (const c of chunks) {
      const r = await transcribeChunk(c.file, c.offsetSec);
      segments.push(...r.segments);
      allWords.push(...r.words);
      console.log(`  +${r.segments.length} cues (offset ${c.offsetSec}s)`);
    }
    if (!segments.length) throw new Error("Whisper returned no segments");

    const cues: Cue[] = segments.map((s, i) => ({
      idx: i,
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
      tokens: [],
    }));

    console.log(`• glossing ${cues.length} cues`);
    const batches: Cue[][] = [];
    for (let i = 0; i < cues.length; i += CUES_PER_GLOSS_BATCH) {
      batches.push(cues.slice(i, i + CUES_PER_GLOSS_BATCH));
    }

    const payloads = new Array<GlossPayload>(batches.length);
    for (let i = 0; i < batches.length; i += GLOSS_CONCURRENCY) {
      await Promise.all(
        batches.slice(i, i + GLOSS_CONCURRENCY).map(async (batch, k) => {
          const at = i + k;
          const text = batch.map((c) => c.text).join(" ");
          const key = `vgloss::v1::${meta.id}::${at}`;
          const hit = await cachedGloss(key);
          if (hit) { payloads[at] = hit; return; }
          const got = await glossBatch(text);
          await putGloss(key, got);
          payloads[at] = got;
        })
      );
      console.log(`  ${Math.min(i + GLOSS_CONCURRENCY, batches.length)}/${batches.length} batches`);
    }

    batches.forEach((batch, bi) => {
      const p = payloads[bi] ?? { glosses: [], expressions: [] };
      const glossBy = new Map(p.glosses.map((g) => [g.surface.toLowerCase(), { lemma: g.lemma, gloss: g.gloss }]));
      for (const cue of batch) {
        const inCue = allWords.filter(
          (w) => w.start * 1000 >= cue.startMs - 250 && w.start * 1000 <= cue.endMs + 250
        );
        cue.tokens = buildTokens(cue.text, glossBy, p.expressions, inCue, cue.startMs);
      }
    });

    console.log("• writing to database");
    const existing = await db.select().from(videoLessons).where(eq(videoLessons.youtubeId, meta.id));
    let lessonId: number;
    if (existing.length) {
      lessonId = existing[0].id;
      await db.update(videoLessons)
        .set({ title: meta.title, channel: meta.channel, durationSec: meta.durationSec,
               thumbnailUrl: meta.thumbnailUrl, level })
        .where(eq(videoLessons.id, lessonId));
      await db.delete(videoCues).where(eq(videoCues.lessonId, lessonId));
    } else {
      await db.insert(videoLessons).values({
        youtubeId: meta.id, title: meta.title, channel: meta.channel,
        durationSec: meta.durationSec, thumbnailUrl: meta.thumbnailUrl,
        level, addedAt: Date.now(),
      });
      const rows = await db.select().from(videoLessons).where(eq(videoLessons.youtubeId, meta.id));
      lessonId = rows[0].id;
    }

    for (let i = 0; i < cues.length; i += 100) {
      await db.insert(videoCues).values(
        cues.slice(i, i + 100).map((c) => ({
          lessonId, idx: c.idx, startMs: c.startMs, endMs: c.endMs,
          text: c.text, tokensJson: JSON.stringify(c.tokens),
        }))
      );
    }

    const tokenCount = cues.reduce((n, c) => n + c.tokens.length, 0);
    const exprCount = cues.reduce((n, c) => n + c.tokens.filter((t) => t.kind === "expression").length, 0);
    console.log(`✓ ${meta.title}`);
    console.log(`  ${cues.length} cues, ${tokenCount} tokens (${exprCount} expressions)`);
    console.log(`  last cue ends at ${(cues[cues.length - 1].endMs / 1000).toFixed(0)}s of ${meta.durationSec}s`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
