/**
 * ListeningTab ("Listening Lab") — turn a TCF listening clip into a study sheet.
 *
 * Two inputs:
 *  1. Paste a TV5Monde TCF test URL → the app discovers each listening clip and
 *     transcribes them on demand.
 *  2. Upload an audio file → transcribe directly.
 *
 * Each clip gives: an audio player, the French transcript, and (on request) an
 * English translation + B1 vocabulary you can save to your library.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Headphones, Link2, Upload, Loader2, Plus, Check, Languages, ListPlus,
} from "lucide-react";

type Vocab = { term: string; translation: string };

export default function ListeningTab() {
  const [mode, setMode] = useState<"url" | "upload">("url");
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Headphones className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-xl font-bold text-foreground">Listening Lab</h2>
            <p className="text-sm text-muted-foreground">Get the transcript, translation & vocab for a listening exercise</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([["url", "TCF test URL", Link2], ["upload", "Upload audio", Upload]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all",
                mode === id ? "bg-primary/15 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted/30"
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {mode === "url" ? <UrlMode /> : <UploadMode />}
      </div>
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
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{clips.length} clip{clips.length > 1 ? "s" : ""} found</p>
          {clips.map((c) => (
            <ClipCard key={c.audioUrl} index={c.index} audioUrl={c.audioUrl} />
          ))}
        </div>
      )}

      {loaded && clips.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
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
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
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
      await addVocab.mutateAsync({ term: v.term, translation: v.translation, entryKind: "word", lessonSource: "Listening Lab" });
      setSaved((s) => new Set(s).add(v.term.toLowerCase()));
      utils.vocab.list.invalidate();
    } catch { toast.error("Couldn't save the word"); }
  };

  const saveAll = async () => {
    const items = (analysis?.vocab ?? []).filter((v) => !saved.has(v.term.toLowerCase()));
    if (!items.length) return;
    try {
      await bulkAdd.mutateAsync(items.map((v) => ({ term: v.term, translation: v.translation, entryKind: "word" as const, lessonSource: "Listening Lab" })));
      setSaved((s) => { const n = new Set(s); items.forEach((v) => n.add(v.term.toLowerCase())); return n; });
      utils.vocab.list.invalidate();
      toast.success(`Saved ${items.length} words to your library`);
    } catch { toast.error("Couldn't save the words"); }
  };

  return (
    <div className="space-y-3 pt-1">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Transcript</p>
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
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">English translation</p>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/20 rounded-xl p-3">{analysis.translation}</p>
            </div>
          )}
          {analysis.vocab.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Vocabulary</p>
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
                    <div key={i} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-foreground">{v.term}</span>
                        <span className="text-xs text-muted-foreground"> — {v.translation}</span>
                      </div>
                      <button
                        onClick={() => saveOne(v)}
                        disabled={isSaved || addVocab.isPending}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors shrink-0",
                          isSaved ? "text-emerald-400 cursor-default" : "text-muted-foreground hover:text-primary hover:bg-primary/10"
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
