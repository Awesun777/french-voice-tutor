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
  Activity, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Clock3,
  ListTodo, Loader2, Plus, Trash2, XCircle,
} from "lucide-react";

function ago(ts: number | null | undefined): string {
  if (!ts) return "never";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
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
  const utils = trpc.useUtils();

  const jobs = trpc.ops.jobs.useQuery(undefined, { refetchInterval: 15000 });
  const todos = trpc.ops.todos.list.useQuery();

  const invalidate = () => utils.ops.todos.list.invalidate();
  const add = trpc.ops.todos.add.useMutation({ onSuccess: () => { setNewTodo(""); invalidate(); }, onError: (e) => toast.error(e.message) });
  const toggle = trpc.ops.todos.toggle.useMutation({ onSuccess: invalidate });
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
                      <div key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RunChip status={r.status} />
                        <span>{ago(r.startedAt)}{r.summary ? ` — ${r.summary}` : ""}</span>
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

          {active.map((t, i) => (
            <div key={t.id} className="group flex items-center gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggle.mutate({ id: t.id })}
                className="w-4 h-4 accent-primary flex-none cursor-pointer"
              />
              <span className="flex-1 text-sm text-foreground">{t.text}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button disabled={i === 0} onClick={() => move.mutate({ id: t.id, direction: "up" })}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button disabled={i === active.length - 1} onClick={() => move.mutate({ id: t.id, direction: "down" })}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove.mutate({ id: t.id })}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}

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
