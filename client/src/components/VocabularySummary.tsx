import { useState, type ReactNode } from "react";
import { Sparkles, BookOpen, BadgeCheck, Check } from "lucide-react";
import type { VocabEntry } from "@/types";
import { cn } from "@/lib/utils";
import { summarizeVocabulary, type VocabularyStage } from "@/lib/vocabularySummary";

const stages = [
  { key: "new", label: "New", color: "bg-accent", surface: "bg-accent/15 text-primary border-accent/25", icon: Sparkles, description: "Words you haven't reviewed yet" },
  { key: "learning", label: "Learning", color: "bg-star", surface: "bg-star/15 text-primary border-star/25", icon: BookOpen, description: "Includes words in learning and review" },
  { key: "mastered", label: "Mastered", color: "bg-primary", surface: "bg-primary text-primary-foreground border-primary", icon: BadgeCheck, description: "Words marked mastered by spaced repetition" },
] as const;

export default function VocabularySummary({ words, selected, onSelect, actions, calendar }: {
  words: Pick<VocabEntry, "sm2Status">[];
  selected: VocabularyStage | null;
  onSelect: (stage: VocabularyStage | null) => void;
  actions?: ReactNode;
  calendar?: ReactNode;
}) {
  const [mode, setMode] = useState("percent");
  const counts = summarizeVocabulary(words);
  const percent = (value: number) => counts.total ? value / counts.total * 100 : 0;
  const displayPercent = (value: number) => {
    const valuePercent = percent(value);
    if (valuePercent > 0 && valuePercent < 1) return "<1";
    if (valuePercent > 99 && valuePercent < 100) return ">99";
    return String(Math.round(valuePercent));
  };

  return (
    <section aria-label="Vocabulary progress" className="rounded-3xl bg-secondary/70 p-5 sm:px-7 sm:py-5 text-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => onSelect(null)} aria-pressed={selected === null} className="text-sm rounded-md focus-visible:outline-2 focus-visible:outline-primary">
          <strong className="text-base tabular-nums">{counts.total.toLocaleString()}</strong> total vocab items
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0" aria-live="polite">
          <button type="button" onClick={() => setMode((value) => value === "percent" ? "number" : "percent")} aria-label={`Mastered: ${mode === "percent" ? `${displayPercent(counts.mastered)} percent` : counts.mastered.toLocaleString()}. Click to show ${mode === "percent" ? "numbers" : "percentages"}.`} className="block max-w-full text-left font-display font-black leading-none tracking-tighter text-6xl sm:text-8xl break-all rounded-lg hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary transition-colors">
            {mode === "percent" ? displayPercent(counts.mastered) : counts.mastered.toLocaleString()}
            {mode === "percent" && <span className="text-3xl sm:text-5xl">%</span>}
          </button>
          <p className="text-lg font-bold">Mastered</p>
        </div>
        <div className="shrink-0 text-center" aria-hidden="true">
          <p className="rounded-xl bg-background px-2 py-1 text-sm -rotate-3 mb-2">{counts.total === 0 ? "On y va !" : "Ça avance !"}</p>
          <img src="/brand/romaintalk-icon.png" alt="" width={80} height={80} className="h-16 w-16 sm:h-20 sm:w-20 mx-auto rounded-2xl" />
        </div>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-primary/10" role="img" aria-label={`${counts.new} new, ${counts.learning} learning including review, ${counts.mastered} mastered`}>
        {stages.map(({ key, color }) => <span key={key} className={color} style={{ width: `${percent(counts[key])}%` }} />)}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 pb-1">
        {stages.map(({ key, label, surface, icon: Icon, description }) => (
          <button key={key} type="button" aria-pressed={selected === key} aria-label={`${label}: ${counts[key]}. ${description}. ${selected === key ? "Click again to remove filter." : "Filter library."}`} onClick={() => onSelect(selected === key ? null : key)} className={cn("relative min-w-0 flex flex-col items-center justify-center gap-1.5 rounded-t-2xl rounded-b-xl border border-b-4 px-1.5 py-4 text-center shadow-sm motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary", surface, selected === key && "ring-2 ring-primary ring-offset-2 ring-offset-secondary")}>
            {selected === key && <Check aria-hidden="true" className="absolute right-1.5 top-1.5 h-3.5 w-3.5" />}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-current/10" aria-hidden="true"><Icon className="h-4 w-4" strokeWidth={1.75} /></span>
            <span className="text-sm font-semibold">{label}</span>
            <strong className="block w-full break-all font-display text-2xl sm:text-3xl font-black leading-tight tracking-tight tabular-nums">{mode === "percent" ? `${displayPercent(counts[key])}%` : counts[key].toLocaleString()}</strong>
          </button>
        ))}
      </div>
      {actions && <div className="mt-3">{actions}</div>}
      {calendar && <div className="mt-4 border-t border-primary/10 pt-4">{calendar}</div>}
    </section>
  );
}
