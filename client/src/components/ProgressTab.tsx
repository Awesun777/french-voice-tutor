import { trpc } from "@/lib/trpc";
import { Loader2, Flame, BookOpen, Brain, Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

function fmtDate(dateKey: string) {
  return new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
      </div>
    </div>
  );
}
