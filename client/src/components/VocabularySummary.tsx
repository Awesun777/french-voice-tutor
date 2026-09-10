import { useState } from "react";
import type { VocabEntry } from "@/types";
import { cn } from "@/lib/utils";
import { summarizeVocabulary, type VocabularyStage } from "@/lib/vocabularySummary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const stages = [
  { key: "new", label: "New", color: "bg-accent", description: "Words you haven't reviewed yet" },
  { key: "learning", label: "Learning", color: "bg-star", description: "Includes words in learning and review" },
  { key: "mastered", label: "Mastered", color: "bg-primary", description: "Words marked mastered by spaced repetition" },
] as const;

export default function VocabularySummary({ words, selected, onSelect }: {
  words: Pick<VocabEntry, "sm2Status">[];
  selected: VocabularyStage | null;
  onSelect: (stage: VocabularyStage | null) => void;
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
        <ToggleGroup type="single" value={mode} onValueChange={(value) => { if (value) setMode(value); }} aria-label="Display vocabulary counts" className="rounded-full bg-background p-1">
          <ToggleGroupItem value="number" aria-label="Show numbers" className="px-3 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground first:rounded-l-full">Numbers</ToggleGroupItem>
          <ToggleGroupItem value="percent" aria-label="Show percentages" className="px-3 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground last:rounded-r-full">%</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0" aria-live="polite">
          <p className="font-display font-black leading-none tracking-tighter text-6xl sm:text-8xl break-all">
            {mode === "percent" ? displayPercent(counts.mastered) : counts.mastered.toLocaleString()}
            {mode === "percent" && <span className="text-3xl sm:text-5xl">%</span>}
          </p>
          <p className="text-lg font-bold">Mastered</p>
          <p className="text-sm text-muted-foreground">
            {counts.total === 0 ? "Your first word starts the journey" : mode === "percent" ? `${counts.mastered.toLocaleString()} vocab items mastered` : `${displayPercent(counts.mastered)}% of your library`}
          </p>
        </div>
        <div className="shrink-0 text-center" aria-hidden="true">
          <p className="rounded-xl bg-background px-2 py-1 text-sm -rotate-3 mb-2">{counts.total === 0 ? "On y va !" : "Ça avance !"}</p>
          <img src="/brand/romaintalk-icon.png" alt="" width={80} height={80} className="h-16 w-16 sm:h-20 sm:w-20 mx-auto rounded-2xl" />
        </div>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-primary/10" role="img" aria-label={`${counts.new} new, ${counts.learning} learning including review, ${counts.mastered} mastered`}>
        {stages.map(({ key, color }) => <span key={key} className={color} style={{ width: `${percent(counts[key])}%` }} />)}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {stages.map(({ key, label, color, description }) => (
          <button key={key} type="button" aria-pressed={selected === key} aria-label={`${label}: ${counts[key]}. ${description}. Filter library.`} onClick={() => onSelect(selected === key ? null : key)} className={cn("rounded-lg py-2 text-left text-sm hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-primary", selected === key && "bg-background/80")}>
            <span className={cn("inline-block w-2 h-2 rounded-full mr-1.5", color)} />{label}
            <strong className="ml-3.5 block tabular-nums">{mode === "percent" ? `${displayPercent(counts[key])}%` : counts[key].toLocaleString()}</strong>
          </button>
        ))}
      </div>
      {selected && <button type="button" className="mt-1 text-sm underline underline-offset-4" onClick={() => onSelect(null)}>Clear status filter</button>}
    </section>
  );
}
