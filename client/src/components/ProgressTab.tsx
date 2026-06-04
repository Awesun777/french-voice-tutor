import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Loader2, Flame, BookOpen, Brain, Star, Settings2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

function fmtDate(dateKey: string) {
  return new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── SM-2 Stats Panel ────────────────────────────────────────────────────────
function SM2StatsPanel() {
  const { data: sm2Stats } = trpc.review.getStats.useQuery();
  if (!sm2Stats) return null;
  const total = (sm2Stats.new + sm2Stats.learning + sm2Stats.review + sm2Stats.mastered) || 1;
  const bars = [
    { label: "New", count: sm2Stats.new, color: "bg-muted", text: "text-muted-foreground" },
    { label: "Learning", count: sm2Stats.learning, color: "bg-yellow-500", text: "text-yellow-400" },
    { label: "Review", count: sm2Stats.review, color: "bg-blue-500", text: "text-blue-400" },
    { label: "Mastered", count: sm2Stats.mastered, color: "bg-green-500", text: "text-green-400" },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <p className="text-sm font-bold text-foreground mb-4">SM-2 Mastery Breakdown</p>
      <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-0.5">
        {bars.map((b) => b.count > 0 && (
          <div key={b.label} className={cn(b.color, "transition-all")} style={{ width: `${(b.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {bars.map((b) => (
          <div key={b.label} className="text-center">
            <p className={cn("text-lg font-bold", b.text)}>{b.count}</p>
            <p className="text-xs text-muted-foreground">{b.label}</p>
          </div>
        ))}
      </div>
      {sm2Stats.dueToday > 0 && (
        <p className="text-xs text-accent font-semibold mt-3 text-center">{sm2Stats.dueToday} words due for review today</p>
      )}
    </div>
  );
}

// ─── Review Settings Panel ────────────────────────────────────────────────────
function ReviewSettingsPanel() {
  const { data: settings, refetch } = trpc.review.getSettings.useQuery();
  const updateMutation = trpc.review.updateSettings.useMutation({ onSuccess: () => refetch() });
  const [open, setOpen] = useState(false);
  const [newWordsCap, setNewWordsCap] = useState<number | null>(null);
  const [reviewCap, setReviewCap] = useState<number | null>(null);

  const currentNew = newWordsCap ?? settings?.dailyNewWords ?? 10;
  const currentReview = reviewCap ?? settings?.dailyReviewCap ?? 20;

  const handleSave = () => {
    updateMutation.mutate({ dailyNewWords: currentNew, dailyReviewCap: currentReview });
    setOpen(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-bold text-foreground">Review Settings</p>
        </div>
        <p className="text-xs text-muted-foreground">{currentNew} new · {currentReview} review per day</p>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">New words per day</p>
              <span className="text-sm font-bold text-primary">{currentNew}</span>
            </div>
            <input
              type="range" min={1} max={30} step={1} value={currentNew}
              onChange={(e) => setNewWordsCap(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1</span><span>10</span><span>20</span><span>30</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">Review words per day</p>
              <span className="text-sm font-bold text-primary">{currentReview}</span>
            </div>
            <input
              type="range" min={5} max={100} step={5} value={currentReview}
              onChange={(e) => setReviewCap(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>5</span><span>25</span><span>50</span><span>100</span>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving…" : "Save Settings"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProgressTab() {
  const { data: stats, isLoading } = trpc.progress.stats.useQuery();
  const { data: sessions = [] } = trpc.quiz.history.useQuery();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  const recentSessions = sessions.slice(0, 10).reverse();
  const quizChartData = recentSessions.map((s) => ({
    date: fmtDate(s.createdAt.toISOString().split("T")[0]),
    score: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0,
    total: s.total,
  }));

  const vocabGrowth = stats.byDay.slice(-14).map((d: { date: string; count: number }) => ({
    date: fmtDate(d.date),
    words: d.count,
  }));

  // Cumulative vocab
  let cumulative = 0;
  const cumulativeData = stats.byDay.slice(-14).map((d: { date: string; count: number }) => {
    cumulative += d.count;
    return { date: fmtDate(d.date), total: cumulative };
  });

  const STAT_CARDS = [
    {
      icon: <Flame className="w-5 h-5" />,
      label: "Day Streak",
      value: stats.currentStreak,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
    },
    {
      icon: <BookOpen className="w-5 h-5" />,
      label: "Total Words",
      value: stats.totalWords,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: <Star className="w-5 h-5" />,
      label: "Due for Review",
      value: stats.dueCount,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      icon: <Brain className="w-5 h-5" />,
      label: "Quizzes Taken",
      value: sessions.length,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Your Progress</h2>
          <p className="text-sm text-muted-foreground">Track your French learning journey</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAT_CARDS.map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-4">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", s.bg, s.color)}>
                {s.icon}
              </div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Streak heatmap */}
        {stats.byDay.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm font-bold text-foreground mb-4">Words Added Per Day</p>
            {vocabGrowth.length > 1 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={vocabGrowth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.58 0.02 255)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.58 0.02 255)" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.16 0.018 255)", border: "1px solid oklch(0.25 0.02 255)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "oklch(0.94 0.01 255)" }}
                    itemStyle={{ color: "oklch(0.60 0.20 265)" }}
                  />
                  <Bar dataKey="words" fill="oklch(0.60 0.20 265)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Add more words over multiple days to see the chart</p>
            )}
          </div>
        )}

        {/* Cumulative growth */}
        {cumulativeData.length > 1 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm font-bold text-foreground mb-4">Vocabulary Growth (Last 14 Days)</p>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={cumulativeData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.02 255)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.58 0.02 255)" }} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.58 0.02 255)" }} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.018 255)", border: "1px solid oklch(0.25 0.02 255)", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "oklch(0.94 0.01 255)" }}
                  itemStyle={{ color: "oklch(0.72 0.15 85)" }}
                />
                <Line type="monotone" dataKey="total" stroke="oklch(0.72 0.15 85)" strokeWidth={2} dot={{ r: 3, fill: "oklch(0.72 0.15 85)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Quiz performance */}
        {quizChartData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-sm font-bold text-foreground mb-4">Quiz Scores (%)</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={quizChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.58 0.02 255)" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "oklch(0.58 0.02 255)" }} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.16 0.018 255)", border: "1px solid oklch(0.25 0.02 255)", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "oklch(0.94 0.01 255)" }}
                  itemStyle={{ color: "oklch(0.62 0.18 155)" }}
                  formatter={(v: number) => [`${v}%`, "Score"]}
                />
                <Bar dataKey="score" fill="oklch(0.62 0.18 155)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="text-sm font-bold text-foreground">Recent Quiz Sessions</p>
            </div>
            <div className="divide-y divide-border/50">
              {sessions.slice(0, 8).map((s) => {
                const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
                return (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0",
                      pct >= 80 ? "bg-emerald-500/15 text-emerald-400" : pct >= 60 ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"
                    )}>
                      {pct}%
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {s.score} / {s.total} correct
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.direction === "fr2en" ? "FR → EN" : "EN → FR"}
                        {s.bucketStart && ` · ${fmtDate(s.bucketStart)}${s.bucketEnd && s.bucketEnd !== s.bucketStart ? ` – ${fmtDate(s.bucketEnd)}` : ""}`}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sessions.length === 0 && stats.totalWords === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-lg font-semibold text-foreground mb-2">No data yet</p>
            <p className="text-sm text-muted-foreground">Add words and take quizzes to see your progress here.</p>
          </div>
        )}

        {/* SM-2 Mastery Breakdown */}
        <SM2StatsPanel />

        {/* Review Settings */}
        <ReviewSettingsPanel />
      </div>
    </div>
  );
}
