/**
 * IngestTab — the admin dashboard that feeds the Listening Lab.
 *
 * Paste YouTube links (bare URLs, a watch-later dump, notes with prose — the
 * server extracts every video id it can find), pick a level, submit. Rows land
 * in the ingest queue; a worker on a trusted local machine polls it every few
 * minutes and runs the download → transcribe → gloss pipeline, because YouTube
 * bot-blocks datacentre IPs and the heavy lifting was never meant to happen at
 * request time. Status flows back here as the worker progresses.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Loader2, RotateCcw, Trash2, XCircle, Youtube } from "lucide-react";

const LEVELS = ["auto", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
const levelLabel = (l: string) => (l === "auto" ? "Auto — AI grades the transcript" : l);

function ago(ts: number | null | undefined): string {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const STATUS: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending: { label: "Queued", cls: "bg-muted text-muted-foreground", icon: <Clock3 className="w-3 h-3" /> },
  running: { label: "Processing", cls: "bg-secondary text-secondary-foreground", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  done: { label: "On RomainTube", cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive", icon: <XCircle className="w-3 h-3" /> },
};

export default function IngestTab() {
  const [text, setText] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("auto");
  const utils = trpc.useUtils();

  // Poll while anything is in flight so worker progress shows up by itself.
  const jobs = trpc.ingestQueue.list.useQuery(undefined, { refetchInterval: 8000 });

  const submit = trpc.ingestQueue.submit.useMutation({
    onSuccess: (res) => {
      const queued = res.results.filter((r) => r.outcome === "queued").length;
      const skipped = res.results.length - queued;
      if (!res.results.length) toast.error("No YouTube links found in that text");
      else toast.success(`${queued} queued${skipped ? `, ${skipped} skipped (already known)` : ""}`);
      setText("");
      utils.ingestQueue.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const retry = trpc.ingestQueue.retry.useMutation({ onSuccess: () => utils.ingestQueue.list.invalidate() });
  const remove = trpc.ingestQueue.remove.useMutation({ onSuccess: () => utils.ingestQueue.list.invalidate() });

  const active = (jobs.data ?? []).filter((j) => j.status === "pending" || j.status === "running").length;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Youtube className="w-6 h-6 text-speaking" /> RomainTube Ingest
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste YouTube links below — any text containing links works. A local worker picks jobs up
          within ~5 minutes and runs download, transcription, and glossing; finished videos appear in
          everyone's RomainTube.
        </p>
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"}
          className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring/40 font-mono"
        />
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Level</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
            className="text-sm rounded-lg border border-border bg-background px-2 py-1.5"
          >
            {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
          </select>
          <button
            onClick={() => text.trim() && submit.mutate({ text, level })}
            disabled={submit.isPending || !text.trim()}
            className="ml-auto inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Queue videos
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Jobs</h2>
          {active > 0 && <span className="text-xs text-muted-foreground">{active} in flight — updates automatically</span>}
        </div>

        {jobs.data?.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Nothing queued yet.</p>
        )}

        <div className="space-y-2">
          {(jobs.data ?? []).map((j) => {
            const st = STATUS[j.status] ?? STATUS.pending;
            return (
              <div key={j.id} className="flex items-center gap-3 bg-card rounded-xl ring-1 ring-black/5 p-2.5">
                <img
                  src={`https://i.ytimg.com/vi/${j.youtubeId}/mqdefault.jpg`}
                  alt=""
                  className="w-20 h-12 rounded-lg object-cover flex-none bg-muted"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {j.title || j.youtubeId}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {j.level === "auto" ? "Auto" : j.level} · {ago(j.requestedAt)}
                    {j.status === "failed" && j.error ? ` — ${j.error}` : ""}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full flex-none ${st.cls}`}>
                  {st.icon} {st.label}
                </span>
                {j.status === "failed" && (
                  <button
                    onClick={() => retry.mutate({ id: j.id })}
                    title="Retry"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted flex-none"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                {j.status !== "running" && (
                  <button
                    onClick={() => remove.mutate({ id: j.id })}
                    title="Remove"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted flex-none"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
