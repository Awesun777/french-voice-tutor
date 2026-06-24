/**
 * ReviewLaunch — the shared first screen for both Quiz and Flashcards.
 *
 * Step 1: choose a source — "Due Today" (the spaced-repetition queue) or a
 *         specific date from the dropdown on the right.
 * Step 2: choose how many words — a few presets or "All … left".
 *
 * Calls `onStart({ mode, dateKey, limit })`:
 *   - Due Today      → { mode: "due",  limit }
 *   - a date group   → { mode: "all",  dateKey, limit }
 * `limit` is omitted when the user picks "All … left".
 *
 * When `initialDateKey` is provided (deep-linked from an import / voice CTA),
 * that date is pre-selected and we jump straight to the count chooser.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Brain, CalendarDays, ChevronLeft } from "lucide-react";

function todayKey() { return new Date().toISOString().split("T")[0]; }
function yesterdayKey() { return new Date(Date.now() - 86400000).toISOString().split("T")[0]; }
function fmtDateLabel(dk: string) {
  if (dk === todayKey()) return "Today";
  if (dk === yesterdayKey()) return "Yesterday";
  return new Date(dk + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export interface ReviewLaunchChoice {
  mode: "due" | "all";
  dateKey?: string;
  limit?: number;
  /** Flashcards only — which side of the card shows first. */
  front?: "fr" | "en";
}

interface ReviewLaunchProps {
  /** What kind of session this launches into — only affects the copy. */
  kind: "quiz" | "flashcards";
  /** Pre-select this date and jump to the count chooser (used by CTAs). */
  initialDateKey?: string | null;
  onStart: (choice: ReviewLaunchChoice) => void;
}

export default function ReviewLaunch({ kind, initialDateKey, onStart }: ReviewLaunchProps) {
  const { data: stats } = trpc.review.getStats.useQuery();
  const { data: dates = [] } = trpc.review.getDates.useQuery();

  // source: null = step 1; "due" or a dateKey string = step 2 (count chooser)
  const [source, setSource] = useState<string | null>(initialDateKey ?? null);
  // Flashcards: which side shows first (French term or English translation).
  const [front, setFront] = useState<"fr" | "en">("fr");

  const dueToday = stats?.dueToday ?? 0;
  const verb = kind === "quiz" ? "Quiz" : "Review";

  // Available word count for the chosen source (bounds the presets).
  const available =
    source === "due"
      ? dueToday
      : source
        ? dates.find((d) => d.dateKey === source)?.total ?? 0
        : 0;

  const presets = [10, 20, 30, 50].filter((n) => n < available);

  const frontChoice = kind === "flashcards" ? front : undefined;

  function start(limit?: number) {
    if (source === "due") {
      // For "All left", pass the due count as an explicit limit so the server
      // returns every due word (an explicit limit overrides the daily cap).
      onStart({ mode: "due", limit: limit ?? (available || undefined), front: frontChoice });
    } else if (source) {
      onStart({ mode: "all", dateKey: source, limit, front: frontChoice });
    }
  }

  // ── Step 2: how many words ──────────────────────────────────────────────
  if (source) {
    const label = source === "due" ? "Due Today" : fmtDateLabel(source);
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5 text-center">
          <button
            onClick={() => setSource(initialDateKey ? source : null)}
            disabled={!!initialDateKey}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-0"
          >
            <ChevronLeft className="w-3.5 h-3.5 inline -mt-0.5" /> Back
          </button>
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{verb}</p>
            <h2 className="text-lg font-bold text-foreground mt-1">{label}</h2>
            <p className="text-sm text-muted-foreground mt-1">{available} word{available === 1 ? "" : "s"} available</p>
          </div>

          {available === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing to review here right now. {source === "due" ? "Come back later or pick a date." : ""}
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">How many words?</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {presets.map((n) => (
                  <button
                    key={n}
                    onClick={() => start(n)}
                    className="px-5 py-2.5 rounded-xl bg-card border border-border hover:border-primary/60 hover:bg-muted/50 text-foreground font-semibold text-sm transition-colors"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => start(undefined)}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-colors"
                >
                  All {available} left
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Step 1: choose source ───────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{verb}</p>
          <h2 className="text-lg font-bold text-foreground mt-1">What do you want to review?</h2>
        </div>

        <div className="flex items-stretch gap-2">
          <button
            onClick={() => setSource("due")}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-colors"
          >
            <Brain className="w-5 h-5" />
            <span>Due Today</span>
            <span className="text-sm font-semibold opacity-90">({dueToday})</span>
          </button>

          <div className="relative">
            <select
              value=""
              onChange={(e) => e.target.value && setSource(e.target.value)}
              className="h-full appearance-none pl-9 pr-8 rounded-2xl bg-card border border-border text-sm font-semibold text-foreground hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="" disabled>By date…</option>
              {dates.map((d) => (
                <option key={d.dateKey} value={d.dateKey}>
                  {fmtDateLabel(d.dateKey)} ({d.total})
                </option>
              ))}
            </select>
            <CalendarDays className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {kind === "flashcards" && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground text-center">Show first</p>
            <div className="flex gap-2">
              {([
                { id: "fr" as const, label: "French" },
                { id: "en" as const, label: "English" },
              ]).map((o) => (
                <button
                  key={o.id}
                  onClick={() => setFront(o.id)}
                  className={cn(
                    "flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all",
                    front === o.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {dates.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            No words yet — import vocab or save words from a voice chat to start reviewing.
          </p>
        )}
      </div>
    </div>
  );
}
