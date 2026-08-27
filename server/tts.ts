/**
 * French speech synthesis with a persistent cache.
 *
 * Engine order: ElevenLabs "Anna" (the app's own tutor voice; flash v2.5
 * with an explicit French language code — noticeably more native than
 * gpt-4o-mini-tts on isolated words) → OpenAI gpt-4o-mini-tts as fallback
 * when ElevenLabs errors or runs out of credits.
 *
 * Every synthesis is cached in tts_cache (L1 in-memory, L2 MySQL), keyed by
 * engine-version + text, so a word or sentence is paid for once ever —
 * previously each fresh browser tab re-bought the same audio. ElevenLabs
 * spend comes from the Creator plan's spare credits (~104k/mo after the
 * voice agents' usage).
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { ttsCache } from "../drizzle/schema";
import { getDb } from "./db";

export const ANNA_VOICE_ID = "nVPCtAFzgyMX3FZKNzH0";
const ELEVEN_MODEL = "eleven_flash_v2_5";
/** Bump to invalidate cached audio when the voice/model choice changes. */
const ENGINE_VERSION = `anna-${ELEVEN_MODEL}`;

const MEM_CAP = 300;
const memCache = new Map<string, { base64: string; mimeType: string; engine: string }>();

function cacheKey(text: string): string {
  return createHash("sha256").update(`${ENGINE_VERSION}:${text}`).digest("hex");
}

async function synthesizeElevenLabs(text: string): Promise<{ base64: string; mimeType: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not set");
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ANNA_VOICE_ID}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL, language_code: "fr" }),
    }
  );
  if (!resp.ok) throw new Error(`ElevenLabs TTS ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return { base64: Buffer.from(await resp.arrayBuffer()).toString("base64"), mimeType: "audio/mpeg" };
}

async function synthesizeOpenAi(text: string): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      input: text,
      voice: "marin",
      response_format: "mp3",
      speed: 0.9,
      instructions:
        'The text to speak is ALWAYS French — read it as a native French speaker with authentic French phonetics and a natural French accent. This holds even for single words that happen to be spelled like English words (e.g. "important", "table", "message", "nation", "orange", "possible", "restaurant", "double", "impossible"): pronounce them the French way, NEVER anglicized.',
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return { base64: Buffer.from(await resp.arrayBuffer()).toString("base64"), mimeType: "audio/mpeg" };
}

export async function synthesizeFrench(
  text: string
): Promise<{ base64: string; mimeType: string; engine: string }> {
  const key = cacheKey(text);

  const l1 = memCache.get(key);
  if (l1) return l1;

  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(ttsCache).where(eq(ttsCache.textHash, key));
      if (rows.length > 0) {
        const hit = { base64: rows[0].audioB64, mimeType: rows[0].mimeType, engine: rows[0].engine };
        remember(key, hit);
        return hit;
      }
    } catch { /* cache read failure is non-fatal — synthesize fresh */ }
  }

  let result: { base64: string; mimeType: string; engine: string };
  try {
    result = { ...(await synthesizeElevenLabs(text)), engine: "elevenlabs" };
  } catch (e) {
    console.warn("[TTS] ElevenLabs failed, falling back to OpenAI:", String(e).slice(0, 200));
    result = { ...(await synthesizeOpenAi(text)), engine: "openai" };
  }

  remember(key, result);
  if (db) {
    try {
      await db
        .insert(ttsCache)
        .values({
          textHash: key,
          text: text.slice(0, 600),
          engine: result.engine,
          audioB64: result.base64,
          mimeType: result.mimeType,
          createdAt: Date.now(),
        })
        .onDuplicateKeyUpdate({ set: { audioB64: result.base64, engine: result.engine, createdAt: Date.now() } });
    } catch { /* non-fatal — a cache write failure should not break playback */ }
  }
  return result;
}

function remember(key: string, value: { base64: string; mimeType: string; engine: string }) {
  // Tiny FIFO cap so long sessions can't grow the map unboundedly.
  if (memCache.size >= MEM_CAP) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
  memCache.set(key, value);
}
