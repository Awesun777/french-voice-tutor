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
  CreditCard, ListTodo, Loader2, Pencil, Plus, Trash2, XCircle,
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

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/**
 * The next payment is derived, never stored: last payment plus the billing
 * cycle, rolled forward past today for entries paid several cycles ago. The
 * dashboard shows both ends of that arithmetic.
 */
function nextPayment(lastPaidAt: number, cycle: string): number {
  const d = new Date(lastPaidAt);
  do {
    if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
  } while (d.getTime() <= Date.now());
  return d.getTime();
}

const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** AI subscription tracker: what's running, what it costs, when it renews. */
function Subscriptions() {
  const utils = trpc.useUtils();
  const subs = trpc.ops.subscriptions.list.useQuery();
  const invalidate = () => utils.ops.subscriptions.list.invalidate();
  const add = trpc.ops.subscriptions.add.useMutation({ onSuccess: () => { setForm(EMPTY); invalidate(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.ops.subscriptions.update.useMutation({ onSuccess: () => { setEditingId(null); invalidate(); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.ops.subscriptions.remove.useMutation({ onSuccess: invalidate });

  const EMPTY = { name: "", cost: "", cycle: "monthly" as "monthly" | "yearly", lastPaid: "", notes: "" };
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState(EMPTY);

  const rows = subs.data ?? [];
  const activeRows = rows.filter((r) => r.active);
  const monthlyCents = activeRows.reduce((n, r) => n + (r.cycle === "yearly" ? r.costCents / 12 : r.costCents), 0);

  const parseCost = (v: string) => Math.round(parseFloat(v || "0") * 100) || 0;
  const toForm = (r: (typeof rows)[number]) => ({
    name: r.name,
    cost: (r.costCents / 100).toString(),
    cycle: r.cycle as "monthly" | "yearly",
    lastPaid: r.lastPaidAt ? new Date(r.lastPaidAt).toISOString().slice(0, 10) : "",
    notes: r.notes ?? "",
  });

  const fields = (f: typeof EMPTY, set: (f: typeof EMPTY) => void) => (
    <>
      <input value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} placeholder="Service (Claude, OpenAI API…)"
        className="flex-1 min-w-[8rem] text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground" />
      <div className="flex items-center gap-0.5 text-sm flex-none">
        <span className="text-muted-foreground">$</span>
        <input value={f.cost} onChange={(e) => set({ ...f, cost: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0"
          inputMode="decimal" className="w-14 bg-transparent border-b border-border focus:outline-none focus:border-primary text-right" />
      </div>
      <select value={f.cycle} onChange={(e) => set({ ...f, cycle: e.target.value as "monthly" | "yearly" })}
        className="text-xs bg-transparent border border-border rounded px-1 py-1 flex-none">
        <option value="monthly">/mo</option>
        <option value="yearly">/yr</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-muted-foreground flex-none">
        last paid
        <input type="date" value={f.lastPaid} onChange={(e) => set({ ...f, lastPaid: e.target.value })} title="Last payment date"
          className="text-xs text-muted-foreground bg-transparent border border-border rounded px-1.5 py-1" />
      </label>
      <input value={f.notes} onChange={(e) => set({ ...f, notes: e.target.value })} placeholder="notes"
        className="w-24 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground/60 flex-none" />
    </>
  );

  const payload = (f: typeof EMPTY) => ({
    name: f.name.trim(),
    costCents: parseCost(f.cost),
    cycle: f.cycle,
    lastPaidAt: f.lastPaid ? new Date(`${f.lastPaid}T12:00:00`).getTime() : null,
    notes: f.notes.trim() || undefined,
  });

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-speaking" /> AI subscriptions
        </h2>
        {activeRows.length > 0 && (
          <span className="text-sm font-bold text-primary">≈ {dollars(Math.round(monthlyCents))}/mo</span>
        )}
      </div>

      <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm divide-y divide-border">
        <form className="flex items-center gap-2 p-3 flex-wrap" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) add.mutate(payload(form)); }}>
          <Plus className="w-4 h-4 text-muted-foreground flex-none" />
          {fields(form, setForm)}
          {form.name.trim() && <button type="submit" disabled={add.isPending} className="text-xs font-bold text-primary hover:underline flex-none">Add</button>}
        </form>

        {[...rows].sort((a, b) => {
          if (a.active !== b.active) return b.active - a.active;
          const na = a.lastPaidAt ? nextPayment(a.lastPaidAt, a.cycle) : (a.renewsAt ?? Infinity);
          const nb = b.lastPaidAt ? nextPayment(b.lastPaidAt, b.cycle) : (b.renewsAt ?? Infinity);
          return na - nb;
        }).map((r) => {
          const next = r.lastPaidAt ? nextPayment(r.lastPaidAt, r.cycle) : r.renewsAt;
          const renewIn = next ? Math.ceil((next - Date.now()) / 86400000) : null;
          return editingId === r.id ? (
            <form key={r.id} className="flex items-center gap-2 p-3 flex-wrap bg-muted/20"
              onSubmit={(e) => { e.preventDefault(); update.mutate({ id: r.id, ...payload(edit), notes: edit.notes.trim() || null }); }}>
              {fields(edit, setEdit)}
              <button type="submit" className="text-xs font-bold text-primary hover:underline flex-none">Save</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline flex-none">Cancel</button>
            </form>
          ) : (
            <div key={r.id} className={`group flex items-center gap-3 px-3 py-2.5 ${r.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${r.active ? "text-foreground" : "text-muted-foreground line-through"}`}>{r.name}</p>
                {(r.notes || next !== null) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {r.lastPaidAt && r.active && <span>last paid {shortDate(r.lastPaidAt)} · </span>}
                    {next != null && r.active && (
                      <span className={renewIn !== null && renewIn <= 3 ? "text-speaking font-semibold" : ""}>
                        next {shortDate(next)}{renewIn !== null ? ` (${renewIn <= 0 ? "today" : `in ${renewIn} d`})` : ""}
                      </span>
                    )}
                    {next != null && r.active && r.notes ? " · " : ""}{r.notes ?? ""}
                  </p>
                )}
              </div>
              <span className="text-sm font-bold text-foreground flex-none">{dollars(r.costCents)}<span className="text-xs text-muted-foreground font-normal">/{r.cycle === "yearly" ? "yr" : "mo"}</span></span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(r.id); setEdit(toForm(r)); }} title="Edit"
                  className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => update.mutate({ id: r.id, active: r.active ? 0 : 1 })} title={r.active ? "Mark cancelled" : "Reactivate"}
                  className="p-1 rounded text-muted-foreground hover:text-foreground"><XCircle className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove.mutate({ id: r.id })} title="Delete"
                  className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">No subscriptions tracked yet.</p>}
      </div>
    </section>
  );
}

export default function OpsTab() {
  const [newTodo, setNewTodo] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "med" | "low">("med");
  const [newDeadline, setNewDeadline] = useState("");
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const utils = trpc.useUtils();

  const jobs = trpc.ops.jobs.useQuery(undefined, { refetchInterval: 15000 });
  const todos = trpc.ops.todos.list.useQuery();

  const invalidate = () => utils.ops.todos.list.invalidate();
  const add = trpc.ops.todos.add.useMutation({
    onSuccess: () => { setNewTodo(""); setNewPriority("med"); setNewDeadline(""); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const submitNew = () => {
    if (!newTodo.trim()) return;
    add.mutate({
      text: newTodo,
      priority: newPriority,
      deadline: newDeadline ? new Date(`${newDeadline}T12:00:00`).getTime() : null,
    });
  };
  const toggle = trpc.ops.todos.toggle.useMutation({ onSuccess: invalidate });
  const update = trpc.ops.todos.update.useMutation({ onSuccess: () => { setEditing(null); invalidate(); }, onError: (e) => toast.error(e.message) });
  const move = trpc.ops.todos.move.useMutation({ onSuccess: invalidate });
  const remove = trpc.ops.todos.remove.useMutation({ onSuccess: invalidate });

  const runsFor = (job: string) => (jobs.data?.runs ?? []).filter((r) => r.job === job);
  const q = jobs.data?.queue;
  const active = (todos.data ?? []).filter((t) => !t.done);
  const done = (todos.data ?? []).filter((t) => t.done);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="grid gap-8 lg:grid-cols-2 items-start">
      <div className="space-y-8 min-w-0">
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

      <Subscriptions />
      </div>

      <div className="min-w-0">
      {/* ── Pipeline ── */}
      <section>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <ListTodo className="w-5 h-5 text-speaking" /> Pipeline
        </h2>

        <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm divide-y divide-border">
          <form
            className="flex items-center gap-2 p-3 flex-wrap"
            onSubmit={(e) => { e.preventDefault(); submitNew(); }}
          >
            <Plus className="w-4 h-4 text-muted-foreground flex-none" />
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add to the pipeline…"
              className="flex-1 min-w-[10rem] text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => setNewPriority(NEXT_PRIORITY[newPriority])}
              title="Priority for the new item"
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-none ${PRIORITY_STYLE[newPriority]}`}
            >
              {newPriority}
            </button>
            <input
              type="date"
              value={newDeadline}
              onChange={(e) => setNewDeadline(e.target.value)}
              title="Deadline (optional)"
              className="text-xs text-muted-foreground bg-transparent border border-border rounded px-1.5 py-1 flex-none"
            />
            {newTodo.trim() && (
              <button type="submit" disabled={add.isPending} className="text-xs font-bold text-primary hover:underline flex-none">
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
      </div>
    </div>
  );
}
