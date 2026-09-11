import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VocabularyStage } from "@/lib/vocabularySummary";

export type Swatch = { background: string; color: string };
export const libraryStatusPalette: Swatch[] = [
  { background: "#9ED6DF", color: "#173F6B" },
  { background: "#EAC119", color: "#1D1D1B" },
  { background: "#173F6B", color: "#FFF8ED" },
];
const stages = ["new", "learning", "mastered"] as const;

export default function VocabularyStatusBlocks({ counts, selected, onSelect, displayValue, layout = "columns", palette = libraryStatusPalette }: {
  counts: Record<VocabularyStage, number>;
  selected: VocabularyStage | null;
  onSelect: (stage: VocabularyStage | null) => void;
  displayValue: (value: number) => string;
  layout?: "columns" | "mosaic" | "bands";
  palette?: Swatch[];
}) {
  return <div className={cn("grid gap-0", layout === "columns" && "grid-cols-3", layout === "mosaic" && "grid-cols-2", layout === "bands" && "grid-cols-1")} aria-label="Filter vocabulary by status">
    {stages.map((stage, index) => <button key={stage} type="button" aria-pressed={selected === stage} aria-label={`${stage}: ${counts[stage]}.${stage === "learning" ? " Includes review words." : ""} ${selected === stage ? "Click again to remove filter." : "Filter library."}`} onClick={() => onSelect(selected === stage ? null : stage)} style={palette[index]} className={cn("relative min-w-0 flex items-center justify-center text-center rounded-none border-0 px-2 py-5 focus-visible:outline-2 focus-visible:-outline-offset-4", layout === "mosaic" && index === 0 && "row-span-2", layout === "bands" ? "flex-row gap-5 min-h-20" : "flex-col gap-1 min-h-28", selected === stage && "underline underline-offset-4")}>
      {selected === stage && <Check aria-hidden="true" className="absolute right-2 top-2 h-4 w-4" />}
      <span className="text-sm sm:text-base font-black capitalize sm:uppercase tracking-tight">{stage}</span>
      <strong className="min-w-0 max-w-full break-all text-2xl sm:text-4xl font-black leading-tight tracking-tighter tabular-nums">{displayValue(counts[stage])}</strong>
    </button>)}
  </div>;
}
