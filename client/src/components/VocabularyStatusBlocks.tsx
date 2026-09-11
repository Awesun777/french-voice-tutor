import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VocabularyStage } from "@/lib/vocabularySummary";

export type Swatch = { background: string; color: string };
export { libraryStatusColors as libraryStatusPalette } from "@/lib/libraryPalette";
import { libraryStatusColors as libraryStatusPalette } from "@/lib/libraryPalette";
const stages = ["new", "learning", "mastered"] as const;

export default function VocabularyStatusBlocks({ counts, selected, onSelect, displayValue, layout = "columns", palette = libraryStatusPalette, subdued = false }: {
  counts: Record<VocabularyStage, number>;
  selected: VocabularyStage | null;
  onSelect: (stage: VocabularyStage | null) => void;
  displayValue: (value: number) => string;
  layout?: "columns" | "mosaic" | "bands";
  palette?: Swatch[];
  subdued?: boolean;
}) {
  return <div className={cn("grid gap-0", layout === "columns" && "grid-cols-3", layout === "mosaic" && "grid-cols-2", layout === "bands" && "grid-cols-1")} aria-label="Filter vocabulary by status">
    {stages.map((stage, index) => <button key={stage} type="button" aria-pressed={selected === stage} aria-label={`${stage}: ${counts[stage]}.${stage === "learning" ? " Includes review words." : ""} ${selected === stage ? "Click again to remove filter." : "Filter library."}`} onClick={() => onSelect(selected === stage ? null : stage)} style={subdued ? undefined : palette[index]} className={cn("relative min-w-0 flex items-center justify-center text-center rounded-none border-0 px-2 focus-visible:outline-2 focus-visible:-outline-offset-4", subdued ? "h-[4.2rem] py-1.5" : "py-5", layout === "mosaic" && index === 0 && "row-span-2", layout === "bands" ? "flex-row gap-5 min-h-20" : subdued ? "flex-col gap-1" : "flex-col gap-1 min-h-28", subdued && "text-foreground transition-colors hover:bg-primary/5 focus-visible:outline-primary border-r border-foreground/10 last:border-r-0", subdued && selected === stage && "bg-primary/5 ring-1 ring-inset ring-primary/30", selected === stage && "underline underline-offset-4")}>
      {selected === stage && <Check aria-hidden="true" className="absolute right-2 top-2 h-4 w-4" />}
      <span className={cn("text-sm font-black capitalize sm:uppercase tracking-tight flex items-center gap-2", !subdued && "sm:text-base")}>{subdued && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: palette[index].background }} />}{stage}</span>
      <strong className={cn("min-w-0 max-w-full break-all text-2xl font-black tracking-tighter tabular-nums", subdued ? "sm:text-3xl leading-none" : "sm:text-4xl leading-tight")}>{displayValue(counts[stage])}</strong>
    </button>)}
  </div>;
}
