/**
 * ReviewLaunch — the shared first screen for both Quiz and Flashcards.
 *
 * Step 1: choose a source — "Due Today" (the spaced-repetition queue) or a
 *         specific date from the picker.
 * Step 2: choose how many words — a few presets or "All … left".
 *
 * Calls `onStart({ mode, dateKey, limit })`:
 *   - Due Today      → { mode: "due",  limit }
 *   - a date group   → { mode: "all",  dateKey, limit }
 * `limit` is omitted when the user picks "All … left".
 *
 * When `initialDateKey` is provided (deep-linked from an import / voice CTA),
 * that date is pre-selected and we jump straight to the count chooser.
 *
 * Visually this is the app's front door for reviewing, so it carries more
 * weight than a form: drifting colour fields behind the content, a hero card
 * that counts up to the due total, and the SM-2 buckets surfaced as live stats
 * rather than left buried in the Progress tab. All motion is suppressed under
 * prefers-reduced-motion.
 */
import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Brain, CalendarDays, ChevronLeft, Sparkles, ArrowRight, Check } from "lucide-react";

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
  /** Optional art rendered above the copy, inside the centred column so it
   *  doesn't strand the launch controls halfway down the pane. */
  header?: React.ReactNode;
}

// ─── Motion helpers ───────────────────────────────────────────────────────────

/**
 * Counts from 0 to `value` on mount. Ease-out so it decelerates into the final
 * number rather than stopping dead. Written with rAF rather than a spring: the
 * value must land on exactly `value`, and it has to read as a count, not a blur.
 */
function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const DURATION = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [value, reduce]);

  return <span className={className}>{shown}</span>;
}

/**
 * Two large, heavily blurred colour fields drifting behind the content. Cheap
 * (two transformed divs) and the only thing standing between this screen and
 * the flat cream it used to be. Purely decorative, so aria-hidden.
 */
function DriftingField() {
  const reduce = useReducedMotion();
  const common = "absolute rounded-full blur-3xl pointer-events-none";
  if (reduce) {
    return (
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className={cn(common, "w-[28rem] h-[28rem] -top-32 -left-24 bg-accent/25")} />
        <div className={cn(common, "w-[24rem] h-[24rem] -bottom-28 -right-20 bg-speaking/15")} />
      </div>
    );
  }
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <motion.div
        className={cn(common, "w-[28rem] h-[28rem] -top-32 -left-24 bg-accent/25")}
        animate={{ x: [0, 40, -20, 0], y: [0, 30, 50, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={cn(common, "w-[24rem] h-[24rem] -bottom-28 -right-20 bg-speaking/15")}
        animate={{ x: [0, -35, 15, 0], y: [0, -25, -45, 0], scale: [1, 0.94, 1.06, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/** Children rise and fade in one after another. */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

/** The four SM-2 buckets, in the order a word actually travels through them. */
const BUCKETS = [
  { key: "new", label: "New", dot: "bg-accent-strong" },
  { key: "learning", label: "Learning", dot: "bg-star" },
  { key: "review", label: "Review", dot: "bg-primary" },
  { key: "mastered", label: "Mastered", dot: "bg-emerald-600" },
] as const;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReviewLaunch({ kind, initialDateKey, onStart, header }: ReviewLaunchProps) {
  const { data: stats } = trpc.review.getStats.useQuery();
  const { data: dates = [] } = trpc.review.getDates.useQuery();
  const reduce = useReducedMotion();

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
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
        <DriftingField />
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative w-full max-w-md space-y-6 text-center"
        >
          <motion.button
            variants={item}
            onClick={() => setSource(initialDateKey ? source : null)}
            disabled={!!initialDateKey}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-0"
          >
            <ChevronLeft className="w-3.5 h-3.5 inline -mt-0.5" /> Back
          </motion.button>

          <motion.div variants={item}>
            <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-[0.18em]">{verb}</p>
            <h2 className="font-display text-2xl font-bold text-foreground mt-1.5">{label}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <CountUp value={available} className="font-bold text-foreground" /> word{available === 1 ? "" : "s"} available
            </p>
          </motion.div>

          {available === 0 ? (
            <motion.p variants={item} className="text-sm text-muted-foreground">
              Nothing to review here right now. {source === "due" ? "Come back later or pick a date." : ""}
            </motion.p>
          ) : (
            <>
              <motion.p variants={item} className="text-sm font-semibold text-foreground">
                How many words?
              </motion.p>
              <motion.div variants={item} className="flex flex-wrap gap-2.5 justify-center">
                {presets.map((n) => (
                  <motion.button
                    key={n}
                    onClick={() => start(n)}
                    whileHover={reduce ? undefined : { y: -2 }}
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    className="px-6 py-3 rounded-2xl bg-card text-foreground font-bold text-sm shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.2)] hover:shadow-[0_10px_24px_-10px_rgb(23_63_107_/_0.35)] transition-shadow"
                  >
                    {n}
                  </motion.button>
                ))}
                <motion.button
                  onClick={() => start(undefined)}
                  whileHover={reduce ? undefined : { y: -2 }}
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  className="group px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-[0_8px_20px_-8px_rgb(23_63_107_/_0.6)] hover:shadow-[0_14px_30px_-10px_rgb(23_63_107_/_0.7)] transition-shadow inline-flex items-center gap-2"
                >
                  All {available} left
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </motion.button>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // ── Step 1: choose source ───────────────────────────────────────────────
  const caughtUp = dueToday === 0;
  const total = (stats?.new ?? 0) + (stats?.learning ?? 0) + (stats?.review ?? 0) + (stats?.mastered ?? 0);

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
      <DriftingField />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative w-full max-w-lg space-y-6"
      >
        {header && (
          <motion.div variants={item} className="flex justify-center">
            {/* Soft halo behind whatever art the tab supplies, so it sits on the
                page rather than floating unattached. */}
            <div className="relative">
              <div aria-hidden className="absolute inset-0 -m-3 rounded-full bg-accent/20 blur-2xl" />
              <div className="relative">{header}</div>
            </div>
          </motion.div>
        )}

        <motion.div variants={item} className="text-center">
          <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-[0.18em]">{verb}</p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mt-1.5 leading-tight">
            What do you want to review?
          </h2>
        </motion.div>

        {/* Hero — the one obvious thing to press. */}
        <motion.button
          variants={item}
          onClick={() => !caughtUp && setSource("due")}
          disabled={caughtUp}
          whileHover={reduce || caughtUp ? undefined : { y: -3 }}
          whileTap={reduce || caughtUp ? undefined : { scale: 0.99 }}
          className={cn(
            "group relative w-full overflow-hidden rounded-3xl px-6 py-6 text-left transition-shadow",
            caughtUp
              ? "bg-card cursor-default shadow-[0_2px_12px_-4px_rgb(23_63_107_/_0.18)]"
              : "bg-primary text-primary-foreground shadow-[0_14px_34px_-14px_rgb(23_63_107_/_0.75)] hover:shadow-[0_20px_44px_-14px_rgb(23_63_107_/_0.85)]"
          )}
        >
          {/* Shimmer sweep on hover — the "this is the button" cue. */}
          {!caughtUp && !reduce && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
          )}

          {caughtUp ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-foreground">All caught up</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Nothing due today. Pick a date below to review anyway.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Brain className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">
                  Due today
                </p>
                <p className="font-display text-4xl font-bold leading-none mt-1">
                  <CountUp value={dueToday} />
                  <span className="text-base font-semibold text-primary-foreground/70 ml-2">
                    word{dueToday === 1 ? "" : "s"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-bold flex-shrink-0">
                Start
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          )}
        </motion.button>

        {/* Live SM-2 buckets. Already computed for the due count — surfacing them
            turns a blank screen into a sense of a collection being worked
            through. */}
        {total > 0 && (
          <motion.div variants={item} className="grid grid-cols-4 gap-2.5">
            {BUCKETS.map((b) => (
              <div
                key={b.key}
                className="rounded-2xl bg-card px-3 py-3 text-center shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.16)]"
              >
                <p className="font-display text-xl font-bold text-foreground leading-none">
                  <CountUp value={stats?.[b.key] ?? 0} />
                </p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span className={cn("w-1.5 h-1.5 rounded-full", b.dot)} />
                  {b.label}
                </p>
              </div>
            ))}
          </motion.div>
        )}

        {kind === "flashcards" && (
          <motion.div variants={item} className="flex items-center justify-center gap-3">
            <p className="text-xs font-semibold text-muted-foreground">Show first</p>
            <div className="flex gap-1 p-1 rounded-xl bg-muted/60">
              {([
                { id: "fr" as const, label: "French" },
                { id: "en" as const, label: "English" },
              ]).map((o) => (
                <button
                  key={o.id}
                  onClick={() => setFront(o.id)}
                  className={cn(
                    "relative px-4 py-1.5 rounded-lg text-xs font-bold transition-colors",
                    front === o.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {/* The pill slides between options rather than blinking. */}
                  {front === o.id && (
                    <motion.span
                      layoutId="front-pill"
                      className="absolute inset-0 rounded-lg bg-primary"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{o.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Secondary path, deliberately quieter than the hero. */}
        {dates.length > 0 && (
          <motion.div variants={item} className="flex items-center justify-center">
            <div className="relative">
              <select
                value=""
                onChange={(e) => e.target.value && setSource(e.target.value)}
                aria-label="Review a specific date"
                className="appearance-none pl-9 pr-9 py-2.5 rounded-xl bg-card text-sm font-semibold text-muted-foreground hover:text-foreground shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.16)] hover:shadow-[0_8px_20px_-8px_rgb(23_63_107_/_0.28)] focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer transition-shadow"
              >
                <option value="" disabled>Or review a specific day…</option>
                {dates.map((d) => (
                  <option key={d.dateKey} value={d.dateKey}>
                    {fmtDateLabel(d.dateKey)} ({d.total})
                  </option>
                ))}
              </select>
              <CalendarDays className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </motion.div>
        )}

        {dates.length === 0 && (
          <motion.div variants={item} className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-star flex-shrink-0" />
            No words yet — import vocab or save words from a voice chat to start reviewing.
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
