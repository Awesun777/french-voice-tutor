/**
 * TestLogsTab — the showcase of voice-chat test recordings.
 *
 * Upload screen recordings, review them side by side, and decide which model
 * or prompt behaved best. Videos play inline in a three-per-row grid (native
 * controls, so fullscreen is one click away); each card carries an editable
 * title and a notes line for the verdict.
 *
 * Uploads bypass tRPC: raw bytes to /api/testlogs/upload via XHR, which
 * streams up to 500 MB and reports progress — base64 through the JSON
 * transport would inflate a recording by a third and cap out at ~35 MB.
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Clapperboard, Loader2, Pencil, Trash2, Upload } from "lucide-react";

const fmtSize = (b: number) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b >= 1 << 20 ? `${Math.round(b / (1 << 20))} MB` : `${Math.round(b / 1024)} KB`);
const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
  " · " +
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function TestLogsTab() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const utils = trpc.useUtils();

  const logs = trpc.testLogs.list.useQuery();
  const invalidate = () => utils.testLogs.list.invalidate();
  const update = trpc.testLogs.update.useMutation({ onSuccess: () => { setEditingId(null); invalidate(); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.testLogs.remove.useMutation({ onSuccess: invalidate });

  function upload(file: File) {
    if (!file.type.startsWith("video/")) {
      toast.error("That doesn't look like a video file");
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, "");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/testlogs/upload?title=${encodeURIComponent(title)}`);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 200) {
        toast.success("Uploaded");
        invalidate();
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try { msg = JSON.parse(xhr.responseText).error ?? msg; } catch { /* keep default */ }
        toast.error(msg);
      }
    };
    xhr.onerror = () => { setProgress(null); toast.error("Upload failed — network error"); };
    setProgress(0);
    xhr.send(file);
  }

  return (
    // Home's <main> is overflow-hidden; the tab owns its scrolling.
    <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-speaking" /> Test Logs
        </h1>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={progress !== null}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {progress !== null ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading… {progress}%</>
          ) : (
            <><Upload className="w-4 h-4" /> Upload recording</>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
        />
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Voice-chat test sessions, newest first. Play inline, go fullscreen from the player, note the verdict on each.
      </p>

      {logs.isLoading && <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>}
      {logs.data?.length === 0 && (
        <p className="text-sm text-muted-foreground py-10 text-center">No recordings yet — upload the first one.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(logs.data ?? []).map((l) => (
          <div key={l.id} className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm overflow-hidden group">
            {l.url ? (
              <video
                src={l.url}
                controls
                preload="metadata"
                playsInline
                className="w-full aspect-video bg-black"
              />
            ) : (
              <div className="w-full aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground">
                video unavailable
              </div>
            )}

            <div className="p-3">
              {editingId === l.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editTitle.trim()) update.mutate({ id: l.id, title: editTitle, notes: editNotes.trim() || null });
                  }}
                  className="space-y-1.5"
                >
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-sm font-semibold bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <input
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Verdict / notes…"
                    className="w-full text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="text-xs font-bold text-primary hover:underline">Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-semibold text-foreground flex-1 min-w-0 break-words">{l.title}</p>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-none">
                      <button
                        onClick={() => { setEditingId(l.id); setEditTitle(l.title); setEditNotes(l.notes ?? ""); }}
                        title="Edit title / notes"
                        className="p-1 rounded text-muted-foreground hover:text-foreground"
                      ><Pencil className="w-3.5 h-3.5" /></button>
                      <button
                        onClick={() => remove.mutate({ id: l.id })}
                        title="Delete"
                        className="p-1 rounded text-muted-foreground hover:text-destructive"
                      ><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {l.notes && <p className="text-xs text-foreground/80 mt-0.5">{l.notes}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">{fmtDate(l.createdAt)} · {fmtSize(l.sizeBytes)}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
