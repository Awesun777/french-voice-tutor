/**
 * AccountsTab — who uses RomainTalk, and how much.
 *
 * Everything here is computed from tables the product already writes: signups
 * from `users`, activity from vocab/quiz/voice row counts. No tracking code,
 * no cookies, no third-party script — and deliberately no message or voice
 * CONTENT, only counts. An ops screen shouldn't be a window onto what people
 * told the tutor.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Search, ShieldCheck, Trash2, Users } from "lucide-react";

const fmtDate = (ts: number) =>
  ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function ago(ts: number) {
  if (!ts) return "never";
  const h = Math.round((Date.now() - ts) / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : fmtDate(ts);
}

/** Headline number. Not a chart — one value has no shape worth plotting. */
function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold text-foreground tabular-nums mt-1 leading-none">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

/**
 * Daily signups, 60 days. One series, so no legend — the heading names it.
 * Bars are thin with rounded tops anchored to the baseline, a 2px gap between
 * them, and the axis stays recessive; the count lives in the hover tooltip
 * rather than on every bar.
 */
function SignupChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Signups · last 60 days</p>
        <p className="text-xs text-muted-foreground tabular-nums">{total} total</p>
      </div>
      <div className="flex items-end gap-[2px] h-24">
        {data.map((d) => (
          <div key={d.day} className="group relative flex-1 h-full flex items-end">
            {/* Full-height hit target: the bar itself can be 2px tall. */}
            <div className="absolute inset-0" />
            <div
              className={cn(
                "w-full rounded-t-[4px] transition-colors",
                d.count ? "bg-primary group-hover:bg-accent-strong" : "bg-muted"
              )}
              style={{ height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : "2px" }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-[11px] font-semibold shadow-lg ring-1 ring-black/5">
              {fmtDate(new Date(d.day + "T12:00:00").getTime())} · {d.count} signup{d.count === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
        <span>{fmtDate(new Date(data[0]?.day + "T12:00:00").getTime())}</span>
        <span>Today</span>
      </div>
    </div>
  );
}


/**
 * Daily active users, 60 days. A trend rather than a set of discrete events,
 * so it reads as an area with a 2px line on top — visually distinct from the
 * signup bars above it, which are counts of individual events.
 *
 * One series, so no legend: the heading names it. Values live in the hover
 * tooltip instead of being stamped on every point.
 */
function ActivityChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 600, H = 100, PAD = 8;
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W;
  const y = (c: number) => H - PAD - (c / max) * (H - PAD * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const peak = data.reduce((m, d) => (d.count > m.count ? d : m), data[0] ?? { day: "", count: 0 });

  return (
    <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4">
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Active users per day · last 60 days</p>
        <p className="text-xs text-muted-foreground tabular-nums">peak {peak.count}</p>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Counts anyone who saved a word, quizzed, spoke, or messaged the tutor that day — reading alone leaves no trace.
      </p>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24 block" role="img" aria-label="Daily active users over the last 60 days">
          {/* Recessive baseline — orientation, not decoration. */}
          <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={area} className="fill-primary/15" />
          <path d={line} className="stroke-primary" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>

        {/* Hit targets sit above the SVG so a 0-value day is still hoverable. */}
        <div className="absolute inset-0 flex">
          {data.map((d) => (
            <div key={d.day} className="group relative flex-1">
              <div className="absolute inset-y-0 left-1/2 w-px bg-primary/40 opacity-0 group-hover:opacity-100" />
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-[11px] font-semibold shadow-lg ring-1 ring-black/5">
                {fmtDate(new Date(d.day + "T12:00:00").getTime())} · {d.count} active
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
        <span>{fmtDate(new Date((data[0]?.day ?? "") + "T12:00:00").getTime())}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export default function AccountsTab() {
  const [q, setQ] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const utils = trpc.useUtils();

  const overview = trpc.admin.overview.useQuery();
  const activity = trpc.admin.activity.useQuery();
  const users = trpc.admin.users.useQuery();

  const invalidate = () => { utils.admin.users.invalidate(); utils.admin.overview.invalidate(); };
  const setRole = trpc.admin.setRole.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const del = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { setConfirming(null); setConfirmText(""); toast.success("Account deleted"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users.data ?? [];
    return (users.data ?? []).filter(
      (u) => (u.name ?? "").toLowerCase().includes(needle) || (u.email ?? "").toLowerCase().includes(needle)
    );
  }, [users.data, q]);

  const t = overview.data?.totals;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-speaking" /> Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Computed from your own tables — no tracking, no cookies. Activity counts only, never conversation content.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Stat label="Users" value={t?.users ?? 0} />
          <Stat label="Active · 7d" value={t?.active7 ?? 0} hint="signed in this week" />
          <Stat label="Active · 30d" value={t?.active30 ?? 0} hint="signed in this month" />
          <Stat label="New · 7d" value={t?.newWeek ?? 0} hint="joined this week" />
        </div>

        {overview.data?.signups && <SignupChart data={overview.data.signups} />}

        {/* Engagement — how much the accounts above actually get used. */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Stat
            label="Avg DAU"
            value={activity.data?.avgDau ?? 0}
            hint={activity.data?.stickiness != null ? `${activity.data.stickiness}% of MAU daily` : "30-day mean"}
          />
          <Stat label="Avg WAU" value={activity.data?.avgWau ?? 0} hint="8-week mean" />
          <Stat label="MAU" value={activity.data?.mau ?? 0} hint="active in 30 days" />
          <Stat
            label="Weekly ret."
            value={activity.data?.weeklyRetention == null ? "—" : `${Math.round(activity.data.weeklyRetention * 100)}%`}
            hint="came back next week"
          />
          <Stat
            label="Monthly ret."
            value={activity.data?.monthlyRetention == null ? "—" : `${Math.round(activity.data.monthlyRetention * 100)}%`}
            hint="came back next month"
          />
        </div>

        {activity.data?.daily && <ActivityChart data={activity.data.daily} />}

        <div className="bg-card rounded-2xl ring-1 ring-black/5 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground flex-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email…"
              className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
            <span className="text-xs text-muted-foreground tabular-nums flex-none">{rows.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-bold px-4 py-2">User</th>
                  <th className="text-left font-bold px-2 py-2">Joined</th>
                  <th className="text-left font-bold px-2 py-2">Last seen</th>
                  <th className="text-right font-bold px-2 py-2">Words</th>
                  <th className="text-right font-bold px-2 py-2">Quizzes</th>
                  <th className="text-right font-bold px-2 py-2">Voice</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="group border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2.5 max-w-[16rem]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate">{u.name ?? "—"}</span>
                        {u.role === "admin" && (
                          <span className="flex-none inline-flex items-center gap-0.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                            <ShieldCheck className="w-2.5 h-2.5" /> admin
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email ?? "no email"}</div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="px-2 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{ago(u.lastSignedIn)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{u.words}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{u.quizzes}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{u.voiceSessions}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setRole.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                          title={u.role === "admin" ? "Remove admin" : "Make admin"}
                          className="p-1 rounded text-muted-foreground hover:text-foreground"
                        ><ShieldCheck className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => { setConfirming(u.id); setConfirmText(""); }}
                          title="Delete account and all its data"
                          className="p-1 rounded text-muted-foreground hover:text-destructive"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && !users.isLoading && (
            <p className="px-4 py-8 text-sm text-muted-foreground text-center">No accounts match that search.</p>
          )}
        </div>

        {/* Deletion is irreversible and spans nine tables, so it asks for the
            account's own email rather than a yes/no anyone can click through. */}
        {confirming !== null && (() => {
          const u = (users.data ?? []).find((x) => x.id === confirming);
          if (!u) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-[2px]" onClick={() => setConfirming(null)}>
              <div className="bg-popover rounded-2xl shadow-xl ring-1 ring-black/5 p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                <p className="font-bold text-foreground">Delete {u.name ?? u.email}?</p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Erases the account and everything attached — {u.words} saved words, {u.quizzes} quizzes,
                  {" "}{u.voiceSessions} voice sessions, tutor history, and settings. This cannot be undone.
                </p>
                <p className="text-xs text-muted-foreground mt-3 mb-1">Type <b>{u.email}</b> to confirm:</p>
                <input
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-destructive/40"
                />
                <div className="flex gap-2 mt-4">
                  <button
                    disabled={del.isPending || confirmText.trim().toLowerCase() !== (u.email ?? "").toLowerCase()}
                    onClick={() => del.mutate({ id: u.id, confirmEmail: confirmText })}
                    className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold disabled:opacity-40"
                  >
                    {del.isPending ? "Deleting…" : "Delete permanently"}
                  </button>
                  <button onClick={() => setConfirming(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
