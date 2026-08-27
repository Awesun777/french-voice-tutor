/**
 * Native-speaker word pronunciations from Lingua Libre via Wikimedia Commons.
 *
 * Lingua Libre files are named `LL-Q150 (fra)-<speaker>-<word>.wav` (Q150 =
 * French). We search Commons for an exact `-<word>.wav` match, prefer the mp3
 * transcode Commons generates for every wav (much smaller; falls back to the
 * original wav, which browsers also play), and cache the bytes in word_audio —
 * including misses as status "none" so Commons is queried at most once per word.
 *
 * License: CC BY-SA 4.0 — speaker + source file are stored and returned so the
 * client can attribute (blanket credit lives in Settings).
 */
const UA = { "user-agent": "romaintalk.com dictionary (French tutor app; audio via Lingua Libre)" };

export interface CommonsRecording {
  base64: string;
  mimeType: string;
  speaker: string;
  sourceFile: string;
}

/** "LL-Q150 (fra)-WikiLucas00-essayer.wav" → "WikiLucas00" (word known). */
export function parseSpeaker(fileTitle: string, word: string): string {
  const name = fileTitle.replace(/^File:/, "");
  const prefix = "LL-Q150 (fra)-";
  const suffix = `-${word}.wav`;
  if (name.startsWith(prefix) && name.toLowerCase().endsWith(suffix.toLowerCase())) {
    return name.slice(prefix.length, name.length - suffix.length);
  }
  return "";
}

/** Derive Commons' mp3 transcode URL from an original file URL. */
export function transcodeUrl(originalUrl: string): string {
  // .../wikipedia/commons/a/ab/FILE.wav → .../wikipedia/commons/transcoded/a/ab/FILE.wav/FILE.wav.mp3
  const fileName = originalUrl.split("/").pop() ?? "";
  return originalUrl.replace("/wikipedia/commons/", "/wikipedia/commons/transcoded/") + `/${fileName}.mp3`;
}

/** Find and download a native recording for `word`, or null if none exists. */
export async function fetchCommonsRecording(word: string): Promise<CommonsRecording | null> {
  const q = encodeURIComponent(`intitle:"LL-Q150 (fra)" intitle:"${word}.wav"`);
  const searchRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${q}&srnamespace=6&srlimit=5&format=json`,
    { headers: UA }
  );
  if (!searchRes.ok) throw new Error(`Commons search ${searchRes.status}`);
  const hits: { title: string }[] = (await searchRes.json())?.query?.search ?? [];
  const exact = hits.find((h) => h.title.toLowerCase().endsWith(`-${word.toLowerCase()}.wav`));
  if (!exact) return null;

  const infoRes = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(exact.title)}&prop=imageinfo&iiprop=url&format=json`,
    { headers: UA }
  );
  if (!infoRes.ok) throw new Error(`Commons imageinfo ${infoRes.status}`);
  const pages = (await infoRes.json())?.query?.pages ?? {};
  const originalUrl: string | undefined = (Object.values(pages)[0] as any)?.imageinfo?.[0]?.url;
  if (!originalUrl) return null;

  // Prefer the mp3 transcode; the original wav is the fallback.
  let audioRes = await fetch(transcodeUrl(originalUrl), { headers: UA });
  let mimeType = "audio/mpeg";
  if (!audioRes.ok) {
    audioRes = await fetch(originalUrl, { headers: UA });
    mimeType = "audio/wav";
    if (!audioRes.ok) throw new Error(`Commons audio download ${audioRes.status}`);
  }
  return {
    base64: Buffer.from(await audioRes.arrayBuffer()).toString("base64"),
    mimeType,
    speaker: parseSpeaker(exact.title, word),
    sourceFile: exact.title,
  };
}
