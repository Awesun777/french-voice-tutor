import { useState, type ReactNode } from "react";
import type { VocabEntry } from "@/types";
import VocabularyStatusBlocks from "./VocabularyStatusBlocks";
import { summarizeVocabulary, type VocabularyStage } from "@/lib/vocabularySummary";

const stages = [
  { key: "new", color: "bg-accent" },
  { key: "learning", color: "bg-speaking" },
  { key: "mastered", color: "bg-primary" },
] as const;

export default function VocabularySummary({ words, selected, onSelect, actions, calendar, joined = false }: {
  words: Pick<VocabEntry, "sm2Status">[];
  selected: VocabularyStage | null;
  onSelect: (stage: VocabularyStage | null) => void;
  actions?: ReactNode;
  calendar?: ReactNode;
  joined?: boolean;
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
    <section aria-label="Vocabulary progress" className={`bg-secondary p-5 sm:px-7 sm:py-5 text-primary ${joined ? "rounded-t-3xl" : "rounded-3xl"}`}>
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
      <div className="mt-4">
        <VocabularyStatusBlocks counts={counts} selected={selected} onSelect={onSelect} displayValue={(value) => mode === "percent" ? `${displayPercent(value)}%` : value.toLocaleString()} />
      </div>
      {actions && <div className="mt-3">{actions}</div>}
      {calendar && <div className="mt-4 border-t border-primary/10 pt-4">{calendar}</div>}
    </section>
  );
}
