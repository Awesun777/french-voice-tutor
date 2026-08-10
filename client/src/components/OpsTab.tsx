/**
 * OpsTab — the admin's operations dashboard.
 *
 * Jobs: the two local fetchers (reading and video), each a card with its
 * schedule, its latest heartbeat run, and the recent run history; plus the
 * live RomainTube queue counts. The schedules run on a machine this server
 * can't see — the heartbeat rows in job_runs are how their work shows up here.
 *
 * Pipeline: the product to-do list. Add, check to strike through (done items
 * sink), reorder actives with up/down, delete. Priorities are whatever order
 * the list is in — that's the point.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity, ArrowDown, ArrowUp, CalendarDays, CheckCircle2, ChevronDown, Clock3,
  ListTodo, Loader2, Pencil, Plus, Trash2, XCircle,
} from "lucide-react";

/** high → med → low → high; a click walks the cycle. */
const NEXT_PRIORITY: Record<string, "high" | "med" | "low"> = { high: "med", med: "low", low: "high" };
const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-speaking text-speaking-foreground",
  med: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

function deadlineLabel(ts: number): { text: string; cls: string } {
  const days = Math.ceil((ts - Date.now()) / 86400000);
  const date = new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return { text: `${date} · overdue`, cls: "text-destructive font-bold" };
  if (days <= 2) return { text: `${date} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : "in 2 d"}`, cls: "text-speaking font-semibold" };
  return { text: date, cls: "text-muted-foreground" };
}

function ago(ts: number | null | undefined): string {
  if (!ts) return "never";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** The run's item list — every article or video it produced, one per line. */
function RunDetail({ detail }: { detail: string | null }) {
  const [open, setOpen] = useState(false);
  if (!detail) return null;
  const lines = detail.split("\n").filter(Boolean);
  return (
    <div className="mt-1">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        {lines.length} item{lines.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-1 pl-4 space-y-0.5">
          {lines.map((l, i) => (
            <li key={i} className={`text-xs ${l.includes("FAILED") ? "text-destructive" : "text-muted-foreground"}`}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RunChip({ status }: { status: string }) {
  if (status === "running")
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>;
  if (status === "ok")
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> OK</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive"><XCircle className="w-3 h-3" /> Failed</span>;
}

export default function OpsTab() {
  const [newTodo, setNewTodo] = useState("");
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const utils = trpc.useUtils();

  const jobs = trpc.ops.jobs.useQuery(undefined, { refetchInterval: 15000 });
  const todos = trpc.ops.todos.list.useQuery();

  const invalidate = () => utils.ops.todos.list.invalidate();
  const add = trpc.ops.todos.add.useMutation({ onSuccess: () => { setNewTodo(""); invalidate(); }, onError: (e) => toast.error(e.message) });
  const toggle = trpc.ops.todos.toggle.useMutation({ onSuccess: invalidate });
  const update = trpc.ops.todos.update.useMutation({ onSuccess: () => { setEditing(null); invalidate(); }, onError: (e) => toast.error(e.message) });
  const move = trpc.ops.todos.move.useMutation({ onSuccess: invalidate });
  const remove = trpc.ops.todos.remove.useMutation({ onSuccess: invalidate });

  const runsFor = (job: string) => (jobs.data?.runs ?? []).filter((r) => r.job === job);
  const q = jobs.data?.queue;
  const active = (todos.data ?? []).filter((t) => !t.done);
  const done = (todos.data ?? []).filter((t) => t.done);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
      {/* ── Jobs ── */}
      <section>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 mb-1">
          <Activity className="w-6 h-6 text-speaking" /> Operations
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The fetchers run on the studio machine; runs report in here as they happen.
        </p>

        <div className="space-y-3">
          {(jobs.data?.schedules ?? []).map((s) => {
            const runs = runsFor(s.job);
            const latest = runs[0];
            const showHistory = openHistory === s.job;
            return (
              <div key={s.job} className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                  {latest ? <RunChip status={latest.status} /> : <span className="text-[11px] text-muted-foreground">no runs yet</span>}
                </div>
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" /> {s.schedule}</span>
                  {latest && (
                    <>
                      <span>·</span>
                      <span>last run {ago(latest.startedAt)}{latest.summary ? ` — ${latest.summary}` : ""}</span>
                    </>
                  )}
                </div>
                {latest && <RunDetail detail={latest.detail} />}
                {runs.length > 1 && (
                  <button
                    onClick={() => setOpenHistory(showHistory ? null : s.job)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? "rotate-180" : ""}`} />
                    {showHistory ? "Hide" : "Show"} history
                  </button>
                )}
                {showHistory && (
                  <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                    {runs.slice(1, 8).map((r) => (
                      <div key={r.id} className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <RunChip status={r.status} />
                          <span>{ago(r.startedAt)}{r.summary ? ` — ${r.summary}` : ""}</span>
                        </div>
                        <RunDetail detail={r.detail} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Queue snapshot */}
          {q && (
            <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4 flex items-center gap-4 flex-wrap">
              <p className="text-sm font-bold text-foreground flex-1">RomainTube queue</p>
              <span className="text-xs text-muted-foreground">{q.pending} queued</span>
              <span className="text-xs text-muted-foreground">{q.running} processing</span>
              <span className={`text-xs ${q.failed ? "text-destructive font-bold" : "text-muted-foreground"}`}>{q.failed} failed</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Pipeline ── */}
      <section>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <ListTodo className="w-5 h-5 text-speaking" /> Pipeline
        </h2>

        <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm divide-y divide-border">
          <form
            className="flex items-center gap-2 p-3"
            onSubmit={(e) => { e.preventDefault(); if (newTodo.trim()) add.mutate({ text: newTodo }); }}
          >
            <Plus className="w-4 h-4 text-muted-foreground flex-none" />
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add to the pipeline…"
              className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
            {newTodo.trim() && (
              <button type="submit" disabled={add.isPending} className="text-xs font-bold text-primary hover:underline">
                Add
              </button>
            )}
          </form>

          {active.map((t, i) => {
            const sameTier = active.filter((x) => x.priority === t.priority);
            const tierIdx = sameTier.findIndex((x) => x.id === t.id);
            const due = t.deadline ? deadlineLabel(t.deadline) : null;
            return (
              <div key={t.id} className="group flex items-center gap-2.5 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggle.mutate({ id: t.id })}
                  className="w-4 h-4 accent-primary flex-none cursor-pointer"
                />
                <button
                  onClick={() => update.mutate({ id: t.id, priority: NEXT_PRIORITY[t.priority] })}
                  title="Change priority"
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-none ${PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.med}`}
                >
                  {t.priority}
                </button>

                {editing === t.id ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editText.trim()) update.mutate({ id: t.id, text: editText });
                      if (e.key === "Escape") setEditing(null);
                    }}
                    onBlur={() => setEditing(null)}
                    className="flex-1 text-sm bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                ) : (
                  <span
                    className="flex-1 text-sm text-foreground cursor-text"
                    onDoubleClick={() => { setEditing(t.id); setEditText(t.text); }}
                  >
                    {t.text}
                  </span>
                )}

                {due && <span className={`text-[11px] flex-none ${due.cls}`}>{due.text}</span>}

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <label title={t.deadline ? "Change deadline" : "Set deadline"}
                    className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer relative">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <input
                      type="date"
                      value={t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : ""}
                      onChange={(e) =>
                        update.mutate({ id: t.id, deadline: e.target.value ? new Date(`${e.target.value}T12:00:00`).getTime() : null })
                      }
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    />
                  </label>
                  <button onClick={() => { setEditing(t.id); setEditText(t.text); }} title="Edit"
                    className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button disabled={tierIdx === 0} onClick={() => move.mutate({ id: t.id, direction: "up" })}
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button disabled={tierIdx === sameTier.length - 1} onClick={() => move.mutate({ id: t.id, direction: "down" })}
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove.mutate({ id: t.id })}
                    className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}

          {active.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">Pipeline is clear.</p>
          )}

          {done.length > 0 && (
            <div className="px-3 py-2 bg-muted/30">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Done</p>
              {done.map((t) => (
                <div key={t.id} className="group flex items-center gap-3 py-1.5">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggle.mutate({ id: t.id })}
                    className="w-4 h-4 accent-primary flex-none cursor-pointer"
                  />
                  <span className="flex-1 text-sm text-muted-foreground line-through">{t.text}</span>
                  <button onClick={() => remove.mutate({ id: t.id })}
                    className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
