/**
 * VocabHeatmap — a GitHub-style contribution calendar of saved words.
 *
 * Shared by the review launcher (Quiz / Flashcards) and My Library so the two
 * are literally the same control rather than two things that resemble each
 * other. Green scales with that day's word count, today reads as the accent
 * square, and hovering rolls the caption into "Aug 12 · 14 words".
 *
 * The caller decides what a click means: launching a review, or scrolling to
 * that group in a list.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

function todayKey() { return new Date().toISOString().split("T")[0]; }
function yesterdayKey() { return new Date(Date.now() - 86400000).toISOString().split("T")[0]; }

export function fmtHeatmapDate(dk: string) {
  if (dk === todayKey()) return "Today";
  if (dk === yesterdayKey()) return "Yesterday";
  return new Date(dk + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Odometer-style text: each character column rolls old-out/new-in when the
 * string changes, so sweeping across days reads as digits spinning rather
 * than labels blinking. Characters that stay put don't move.
 */
function RollingLabel({ text }: { text: string }) {
  const reduced = useReducedMotion();
  return (
    <span className="inline-flex" aria-live="polite">
      {text.split("").map((ch, i) => (
        <span key={i} className="relative inline-block overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              initial={reduced ? false : { y: 11, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: -11, opacity: 0 }}
              transition={{ duration: 0.16, delay: i * 0.012 }}
              className="inline-block"
            >
              {ch === " " ? " " : ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export function VocabHeatmap({ dates, onPick, selectedKey, idleLabel = "Or pick a day you saved words" }: {
  dates: { dateKey: string; total: number }[];
  onPick: (dateKey: string) => void;
  /** Ringed rather than filled — marks position without restating the count. */
  selectedKey?: string | null;
  idleLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ k: string; c: number } | null>(null);

  // Most recent weeks live at the right edge; start the scroll there.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const counts = new Map(dates.map((d) => [d.dateKey, d.total]));
  const max = Math.max(1, ...Array.from(counts.values()));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 364 - today.getDay());
  const weeks: Date[][] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || !weeks.length) weeks.push([]);
    weeks[weeks.length - 1].push(new Date(d));
  }
  const ymd = (d: Date) => d.toISOString().split("T")[0];
  const tk = todayKey();

  const label = hovered
    ? `${fmtHeatmapDate(hovered.k)} · ${hovered.c === 0 ? "no words" : `${hovered.c} word${hovered.c === 1 ? "" : "s"}`}`
    : idleLabel;

  return (
    <div className="w-full">
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2 h-4">
        <CalendarDays className="w-3.5 h-3.5 flex-none" /> <RollingLabel text={label} />
      </p>
      <div ref={scrollRef} className="overflow-x-auto pb-1" onMouseLeave={() => setHovered(null)}>
        <div className="w-max mx-auto">
          <div className="flex gap-[3px] mb-1">
            {weeks.map((week, i) => {
              const first = week.find((d) => d.getDate() === 1);
              return (
                <span key={i} className="w-3 flex-none text-[9px] text-muted-foreground whitespace-nowrap overflow-visible">
                  {first ? first.toLocaleDateString("en-US", { month: "short" }) : ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {week.map((d) => {
                  const k = ymd(d);
                  const c = counts.get(k) ?? 0;
                  const isToday = k === tk;
                  const style = isToday
                    ? undefined
                    : c
                      ? { background: `rgba(47,158,68,${(0.25 + 0.75 * (c / max)).toFixed(2)})` }
                      : { background: "rgba(23,63,107,0.08)" };
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!c}
                      onClick={() => c && onPick(k)}
                      onMouseEnter={() => setHovered({ k, c })}
                      aria-label={c ? `${c} words from ${fmtHeatmapDate(k)}` : undefined}
                      style={style}
                      className={cn(
                        "w-3 h-3 rounded-[3px] flex-none p-0 border-0",
                        isToday && "bg-primary",
                        selectedKey === k && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                        c ? "cursor-pointer hover:ring-2 hover:ring-primary/50" : "cursor-default"
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1 mt-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0.25, 0.5, 0.75, 1].map((op) => (
          <i key={op} className="w-3 h-3 rounded-[3px]" style={{ background: `rgba(47,158,68,${op})` }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
