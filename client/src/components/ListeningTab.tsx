/**
 * ListeningTab ("Listening Lab").
 *
 * Curated video lessons are the main event and fill the pane. The other three
 * sources — TV5Monde TCF URL, mic recording, file upload — are secondary and
 * live in a compact control top-right; each gives an audio player, a French
 * transcript, and on request a translation plus B1 vocabulary.
 *
 * Opening a video hides this header entirely and hands the whole pane to
 * VideoReader, which owns the way back.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { VideoFeed, VideoReader } from "@/components/VideoReader";
import { toast } from "sonner";
import {
  Link2, Upload, Loader2, Plus, Check, Languages, ListPlus, Mic, Square, Youtube,
} from "lucide-react";

type Vocab = { term: string; translation: string };

export default function ListeningTab() {
  const [mode, setMode] = useState<"videos" | "url" | "record" | "upload">("videos");
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);

  // Reading a video takes over the whole pane: no lab header, no mode
  // switcher, just the player and transcript, with the reader's own back
  // button as the way out.
  if (openVideoId) {
    return <VideoReader youtubeId={openVideoId} onBack={() => setOpenVideoId(null)} />;
  }

  return (
    // Column rather than one big scroller: the video feed and reader manage
    // their own scrolling and need the full height, which they can't get
    // inside the max-w-2xl scrolling wrapper the other modes use.
    <div className="flex-1 flex flex-col min-h-0">
      {/* Full-width like the feed below it — the YouTube-style grid spans the
          pane, so a centered max-w-3xl header would sit visibly off-grid. */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <img
              src="/brand/romaintube-logo.png"
              alt="RomainTube"
              // multiply melts the PNG's baked-in cream background into the
              // page's warm cream, which is one shade darker — without it the
              // logo sits in a visibly lighter rectangle.
              className="h-10 sm:h-12 w-auto mix-blend-multiply"
            />
            <p className="text-sm text-muted-foreground truncate mt-1">
              {mode === "videos"
                ? "Watch with a live transcript"
                : "Transcribe your own audio"}
            </p>
          </div>

          {/* Secondary entries. Videos is the main event, so the other sources
              sit here as a compact control rather than competing with the feed. */}
          <div className="flex-shrink-0 flex items-center gap-1 p-1 rounded-xl bg-speaking-surface border border-speaking/25">
            {([
              ["videos", "Videos", Youtube],
              ["url", "TCF", Link2],
              ["record", "Record", Mic],
              ["upload", "Upload", Upload],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                title={label}
                className={cn(
                  // Burgundy rather than navy: this control is the one bit of
                  // chrome that competes with the video feed, and the palette's
                  // dark red separates it from the primary-coloured everything else.
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  mode === id
                    ? "bg-speaking text-speaking-foreground shadow-sm"
                    : "text-speaking hover:bg-speaking/10"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "videos" ? (
        <VideoFeed onOpen={setOpenVideoId} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-6 space-y-6">
            {mode === "url" ? <UrlMode /> : mode === "record" ? <RecordMode /> : <UploadMode />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── URL mode ─────────────────────────────────────────────────────────────────
function UrlMode() {
  const [url, setUrl] = useState("");
  const [clips, setClips] = useState<{ index: number; audioUrl: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const clipsMutation = trpc.listening.tcfClips.useMutation();

  const load = async () => {
    if (!url.trim()) return;
    try {
      const { clips } = await clipsMutation.mutateAsync({ url: url.trim() });
      setClips(clips);
      setLoaded(true);
      if (!clips.length) toast.info("No listening clips found automatically — try Upload instead.");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load that test");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Paste the TCF test URL (…?tcf_lot_id=53)"
          className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
        <button
          onClick={load}
          disabled={clipsMutation.isPending || !url.trim()}
          className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold text-sm transition-colors flex items-center gap-2"
        >
          {clipsMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : "Load clips"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Auto-discovery reads the listening clips from the TV5Monde test page. If it finds nothing (their page changed), use <span className="font-semibold">Upload audio</span> instead.
      </p>

      {loaded && clips.length > 0 && (
        <div className="space-y-4">
          <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">{clips.length} clip{clips.length > 1 ? "s" : ""} found</p>
          {clips.map((c) => (
            <ClipCard key={c.audioUrl} index={c.index} audioUrl={c.audioUrl} />
          ))}
        </div>
      )}

      {loaded && clips.length === 0 && (
        <div className="rounded-xl card-float bg-card p-4 text-sm text-muted-foreground">
          No clips found automatically. Switch to <span className="font-semibold text-foreground">Upload audio</span> and add the clip file directly.
        </div>
      )}
    </div>
  );
}

function ClipCard({ index, audioUrl }: { index: number; audioUrl: string }) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const transcribe = trpc.listening.transcribeUrl.useMutation();

  const run = async () => {
    try {
      const { transcript } = await transcribe.mutateAsync({ url: audioUrl });
      setTranscript(transcript || "(no speech detected)");
    } catch (e: any) {
      toast.error(e?.message ?? "Transcription failed");
    }
  };

  return (
    <div className="rounded-2xl card-float bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-foreground">Clip {index}</span>
        {!transcript && (
          <button
            onClick={run}
            disabled={transcribe.isPending}
            className="px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {transcribe.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Transcribing…</> : "Transcribe"}
          </button>
        )}
      </div>
      {/* Native player — plays the TV5Monde clip directly (no CORS needed for playback) */}
      <audio controls preload="none" src={audioUrl} className="w-full h-10" />
      {transcript && <TranscriptPanel transcript={transcript} />}
    </div>
  );
}

// ─── Record mode ──────────────────────────────────────────────────────────────
// Capture the mic (e.g. audio you play out loud from another device/speaker),
// then transcribe it through the same endpoint the file upload uses.
function RecordMode() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcribe = trpc.listening.transcribeUpload.useMutation();

  // Pick a container the browser can actually record (Chrome→webm, Safari→mp4).
  const pickMimeType = () => {
    const prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];
    if (typeof MediaRecorder === "undefined") return "";
    return prefs.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  };

  const finish = async () => {
    const type = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    if (!blob.size) { toast.error("No audio was captured — try again."); return; }
    if (audioSrc) URL.revokeObjectURL(audioSrc);
    setAudioSrc(URL.createObjectURL(blob));
    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "mp4" : "webm";
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    try {
      const { transcript } = await transcribe.mutateAsync({ base64, mimeType: type, filename: `recording.${ext}` });
      setTranscript(transcript || "(no speech detected)");
    } catch (e: any) {
      toast.error(e?.message ?? "Transcription failed");
    }
  };

  const start = async () => {
    setTranscript(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access was blocked. Allow mic access in your browser and try again.");
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => void finish();
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center gap-3 py-8 rounded-2xl border-2 border-dashed border-border">
        {!recording ? (
          <button
            onClick={start}
            disabled={transcribe.isPending}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold text-sm transition-colors"
          >
            {transcribe.isPending
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Transcribing…</>
              : <><Mic className="w-5 h-5" /> Start recording</>}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Recording {mmss}
            </div>
            <button
              onClick={stop}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
            >
              <Square className="w-4 h-4" /> Stop &amp; transcribe
            </button>
          </>
        )}
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Play the French audio out loud near your microphone, then stop — the recording is transcribed automatically.
        </p>
      </div>

      {audioSrc && <audio controls src={audioSrc} className="w-full h-10" />}
      {transcript && <TranscriptPanel transcript={transcript} />}
    </div>
  );
}

// ─── Upload mode ──────────────────────────────────────────────────────────────
function UploadMode() {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const transcribe = trpc.listening.transcribeUpload.useMutation();

  const onFile = async (file: File) => {
    setTranscript(null);
    if (audioSrc) URL.revokeObjectURL(audioSrc);
    setAudioSrc(URL.createObjectURL(file));
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    try {
      const { transcript } = await transcribe.mutateAsync({ base64, mimeType: file.type || "audio/mpeg", filename: file.name.slice(0, 200) });
      setTranscript(transcript || "(no speech detected)");
    } catch (e: any) {
      toast.error(e?.message ?? "Transcription failed");
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={transcribe.isPending}
        className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/20 transition-colors text-muted-foreground"
      >
        {transcribe.isPending ? (
          <><Loader2 className="w-6 h-6 animate-spin text-primary" /> <span className="text-sm">Transcribing…</span></>
        ) : (
          <><Upload className="w-6 h-6" /> <span className="text-sm font-semibold text-foreground">Choose an audio file</span> <span className="text-xs">mp3, m4a, wav, ogg… (max 25 MB)</span></>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
      />

      {audioSrc && <audio controls src={audioSrc} className="w-full h-10" />}
      {transcript && <TranscriptPanel transcript={transcript} />}
    </div>
  );
}

// ─── Shared transcript panel: transcript + translate + vocab ───────────────────
function TranscriptPanel({ transcript }: { transcript: string }) {
  const [analysis, setAnalysis] = useState<{ translation: string; vocab: Vocab[] } | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const analyze = trpc.listening.analyze.useMutation();
  const addVocab = trpc.vocab.add.useMutation();
  const bulkAdd = trpc.vocab.bulkAdd.useMutation();
  const utils = trpc.useUtils();

  const runAnalyze = async () => {
    try {
      const res = await analyze.mutateAsync({ transcript });
      setAnalysis(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Analysis failed");
    }
  };

  const saveOne = async (v: Vocab) => {
    try {
      await addVocab.mutateAsync({ term: v.term, translation: v.translation, entryKind: "word", lessonSource: "RomainTube" });
      setSaved((s) => new Set(s).add(v.term.toLowerCase()));
      utils.vocab.list.invalidate();
    } catch { toast.error("Couldn't save the word"); }
  };

  const saveAll = async () => {
    const items = (analysis?.vocab ?? []).filter((v) => !saved.has(v.term.toLowerCase()));
    if (!items.length) return;
    try {
      await bulkAdd.mutateAsync(items.map((v) => ({ term: v.term, translation: v.translation, entryKind: "word" as const, lessonSource: "RomainTube" })));
      setSaved((s) => { const n = new Set(s); items.forEach((v) => n.add(v.term.toLowerCase())); return n; });
      utils.vocab.list.invalidate();
      toast.success(`Saved ${items.length} words to your library`);
    } catch { toast.error("Couldn't save the words"); }
  };

  return (
    <div className="space-y-3 pt-1">
      <div>
        <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Transcript</p>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-xl p-3">{transcript}</p>
      </div>

      {!analysis ? (
        <button
          onClick={runAnalyze}
          disabled={analyze.isPending}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border hover:bg-muted/40 text-foreground text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {analyze.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Languages className="w-4 h-4" /> Translate & extract vocab</>}
        </button>
      ) : (
        <>
          {analysis.translation && (
            <div>
              <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">English translation</p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/20 rounded-xl p-3">{analysis.translation}</p>
            </div>
          )}
          {analysis.vocab.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">Vocabulary</p>
                <button
                  onClick={saveAll}
                  disabled={bulkAdd.isPending}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
                >
                  <ListPlus className="w-3.5 h-3.5" /> Save all
                </button>
              </div>
              <div className="space-y-1.5">
                {analysis.vocab.map((v, i) => {
                  const isSaved = saved.has(v.term.toLowerCase());
                  return (
                    <div key={i} className="flex items-center gap-2 bg-card card-float rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-foreground">{v.term}</span>
                        <span className="text-xs text-muted-foreground"> — {v.translation}</span>
                      </div>
                      <button
                        onClick={() => saveOne(v)}
                        disabled={isSaved || addVocab.isPending}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors shrink-0",
                          isSaved ? "text-emerald-700 cursor-default" : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        )}
                        title={isSaved ? "Saved" : "Save to library"}
                      >
                        {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
