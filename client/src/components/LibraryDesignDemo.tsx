import { useState, useRef } from "react";
import { ArrowLeft, Search, Star, X, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { libraryPalette } from "@/lib/libraryPalette";
import { VocabHeatmap } from "./VocabHeatmap";
import type { VocabEntry } from "@/types";
import { summarizeVocabulary, vocabularyStage, type VocabularyStage } from "@/lib/vocabularySummary";
import VocabularyStatusBlocks, { libraryStatusPalette, type Swatch } from "./VocabularyStatusBlocks";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

// Keep the existing admin-only URLs so previously shared demo links still work.
export type LibraryDemoVariant = "compact" | "cards" | "notebook";
const ink = "#1D1D1B";
const cream = "#F8F3EC";
const designs = [
  { id: "compact", name: "Equal panels", layout: "columns", description: "Three equal status panels. Bold color bands for dates, generous swatches for words.", status: libraryStatusPalette,
    dates: [{ background: "#282828", color: cream }, { background: cream, color: ink }, { background: "#FF6E54", color: ink }, { background: "#9ED6DF", color: ink }, { background: "#FFE459", color: ink }],
    words: [{ background: "#1C213E", color: "#F9F3EF" }, { background: "#F9F3EF", color: ink }, { background: "#D77A48", color: ink }, { background: "#BB8F82", color: ink }],
  },
  { id: "cards", name: "Color mosaic", layout: "mosaic", description: "A palette-style composition: New spans the left, Learning and Mastered share the right.",
    status: [{ background: "#EAE4DA", color: ink }, { background: "#808BC5", color: ink }, { background: "#245E55", color: cream }],
    dates: [{ background: "#245E55", color: cream }, { background: "#EAE4DA", color: ink }, { background: "#808BC5", color: ink }, { background: "#EAA7C7", color: ink }, { background: "#9ED6DF", color: ink }],
    words: [{ background: "#245E55", color: cream }, { background: "#EAE4DA", color: ink }, { background: "#808BC5", color: ink }, { background: "#EAA7C7", color: ink }],
  },
  { id: "notebook", name: "Stacked bands", layout: "bands", description: "Three horizontal status strips, echoed by the stacked date bands below.",
    status: [{ background: "#EAE4DA", color: ink }, { background: "#EAC119", color: ink }, { background: "#1D1D1B", color: cream }],
    dates: [{ background: "#1D1D1B", color: cream }, { background: "#EAC119", color: ink }, { background: "#EAE4DA", color: ink }, { background: "#C63F3E", color: "#FFFFFF" }, { background: "#9ED6DF", color: ink }],
    words: [{ background: "#1D1D1B", color: cream }, { background: "#EAE4DA", color: ink }, { background: "#EAC119", color: ink }, { background: "#9ED6DF", color: ink }],
  },
] as const;

function dateLabel(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { title: key, detail: "Saved vocabulary" };
  const date = new Date(`${key}T12:00:00`);
  return { title: date.toLocaleDateString("en-US", { month: "long", day: "numeric" }), detail: date.toLocaleDateString("en-US", { weekday: "long", year: "numeric" }) };
}

function WordSwatch({ word, swatch }: { word: VocabEntry; swatch: Swatch }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${word.term} — ${word.translation}`);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy this word. You can select and copy the text instead.");
    }
  };
  return <article style={swatch} className="relative min-h-[7.5rem] rounded-xl px-4 py-3 sm:px-5">
    <div className="flex items-start justify-between gap-4">
      <h3 className="min-w-0 text-2xl sm:text-3xl leading-tight font-medium tracking-tight break-words">{word.term}</h3>
      <button type="button" onClick={copy} aria-label={copied ? `Copy ${word.term} again` : `Copy ${word.term} and its meaning`} className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current">{copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}</button>
    </div>
    <p className="mt-1 text-base break-words">{word.translation}</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="min-w-0 break-words">{word.lessonSource || word.groupLabel || (word.entryKind === "phrase" ? "Phrase" : "Word")}</span>
      <span className="inline-flex items-center gap-1 capitalize">{word.starred && <Star className="h-3 w-3 fill-current" aria-label="Starred" />}{vocabularyStage(word)}</span>
    </div>
    <span className="sr-only" aria-live="polite">{copied ? "Copied to clipboard" : ""}</span>
  </article>;
}

export default function LibraryDesignDemo({ variant }: { variant: LibraryDemoVariant }) {
  const { data: words = [], isLoading, isError } = trpc.vocab.list.useQuery();
  const [search, setSearch] = useState("");
  const [starred, setStarred] = useState(false);
  const [stage, setStage] = useState<VocabularyStage | null>(null);
  const [percent, setPercent] = useState(true);
  const [openDates, setOpenDates] = useState<string[]>([]);
  const selectedDesign = designs.find((item) => item.id === variant)!;
  const design = variant === "compact" ? { ...selectedDesign, status: libraryStatusPalette, dates: libraryPalette, words: libraryPalette } : selectedDesign;
  const scrollRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const dateRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const counts = summarizeVocabulary(words);
  const display = (value: number) => {
    if (!percent) return value.toLocaleString();
    const share = counts.total ? value / counts.total * 100 : 0;
    return `${share > 0 && share < 1 ? "<1" : share > 99 && share < 100 ? ">99" : Math.round(share)}%`;
  };
  const query = search.trim().toLocaleLowerCase();
  const filtered = words.filter((word) => (!starred || word.starred) && (!stage || vocabularyStage(word) === stage) && (!query || [word.term, word.translation, word.lessonSource, word.groupLabel].some((value) => value?.toLocaleLowerCase().includes(query))));
  const grouped = filtered.reduce<Record<string, VocabEntry[]>>((groups, word) => {
    (groups[word.dateKey] ??= []).push(word);
    return groups;
  }, {});
  const sortDates = (a: string, b: string) => {
    const aDate = /^\d{4}-\d{2}-\d{2}$/.test(a), bDate = /^\d{4}-\d{2}-\d{2}$/.test(b);
    return aDate && bDate ? b.localeCompare(a) : aDate ? -1 : bDate ? 1 : a.localeCompare(b);
  };
  const allDates = Array.from(new Set(words.map((word) => word.dateKey))).sort(sortDates);
  const groups = Object.entries(grouped).sort(([a], [b]) => sortDates(a, b));
  const changeSearch = (value: string) => {
    setSearch(value);
    // Show search matches immediately; clearing search restores a folded stack.
    setOpenDates(value.trim() ? allDates : []);
  };

  return <div ref={scrollRef} className="h-full overflow-y-auto px-4 pt-5 pb-24 sm:px-6 sm:pb-8">
    <div className={cn("mx-auto", variant === "compact" ? "max-w-5xl" : "max-w-3xl")}>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm mb-4">
        <a href="#library" className="inline-flex items-center gap-2 text-primary hover:underline"><ArrowLeft className="h-4 w-4" />My Library</a>
        <span className="text-muted-foreground">Admin preview · saved words unchanged</span>
      </div>
      <nav aria-label="Library design previews" className="flex flex-wrap gap-2 mb-5">
        {designs.map((item) => <a key={item.id} href={`#library-demo-${item.id}`} aria-current={variant === item.id ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm font-semibold", variant === item.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-primary hover:bg-secondary")}>{item.name}</a>)}
      </nav>
      <h1 className="font-display font-black text-3xl text-primary">{design.name}</h1>
      <p className="mt-2 mb-6 text-base text-muted-foreground">{design.description}</p>
      {isLoading ? <p role="status" className="flex gap-2 py-12"><Loader2 className="h-5 w-5 animate-spin" />Loading vocabulary…</p> : isError ? <p role="alert" className="py-8 text-destructive">Couldn't load your vocabulary. Please try again later.</p> : <>
        <section aria-label="Vocabulary overview" className="text-primary">
          <div className="flex items-center justify-between gap-4 pb-5">
            <div>
              <button type="button" onClick={() => setPercent(!percent)} aria-label={`Mastered ${display(counts.mastered)}. Show ${percent ? "numbers" : "percentages"}.`} className="block text-6xl sm:text-8xl font-black leading-none tracking-tighter text-left rounded-md focus-visible:outline-2 focus-visible:outline-primary">{display(counts.mastered)}</button>
              <p className="text-lg font-bold mt-1">Mastered</p>
              <p className="text-sm mt-2">{counts.total.toLocaleString()} total vocab items</p>
            </div>
            <img src="/brand/romaintalk-icon.png" alt="RomainTalk mascot" className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl" />
          </div>
          <VocabularyStatusBlocks counts={counts} selected={stage} onSelect={setStage} displayValue={display} layout={design.layout} palette={[...design.status]} />
        </section>
        <div ref={toolsRef} className="sticky top-0 z-20 bg-secondary rounded-b-2xl px-4 pt-3 mt-5">
          <VocabHeatmap stretch={variant === "compact"} tone="blue" dates={groups.filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([dateKey, entries]) => ({ dateKey, total: entries.length }))} idleLabel="Saved words · pick a day" onPick={(date) => {
            setOpenDates((old) => Array.from(new Set([...old, date])));
            requestAnimationFrame(() => { const root = scrollRef.current, item = dateRefs.current[date]; if (root && item) root.scrollTop += item.getBoundingClientRect().top - root.getBoundingClientRect().top - (toolsRef.current?.offsetHeight ?? 0) - 8; });
          }} />
        <div className="flex items-center gap-2 border-b border-primary/20 py-2">
          <Search className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
          <input aria-label="Search vocabulary" value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Search your vocabulary…" className="min-w-0 flex-1 bg-transparent text-base min-h-11 px-1 text-primary placeholder:text-primary/60 focus-visible:outline-2 focus-visible:outline-primary" />
          {search && <button type="button" aria-label="Clear search" onClick={() => changeSearch("")} className="flex h-11 w-9 shrink-0 items-center justify-center text-primary"><X className="h-4 w-4" /></button>}
          <button type="button" aria-label="Filter starred words" aria-pressed={starred} onClick={() => setStarred(!starred)} className={cn("flex h-11 shrink-0 items-center justify-center gap-2 px-2 rounded-md", starred ? "bg-primary text-primary-foreground" : "text-primary")}><Star className={cn("h-4 w-4", starred && "fill-current")} /><span className="hidden sm:inline text-sm">Starred</span></button>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 mt-3 mb-5 text-sm text-primary/75">
          <span aria-live="polite">{filtered.length} of {words.length} items</span>
          <div className="flex gap-4"><button type="button" onClick={() => setOpenDates([])} className="py-2 hover:underline">Fold all</button><button type="button" onClick={() => setOpenDates(groups.map(([date]) => date))} className="py-2 hover:underline">Unfold all</button></div>
        </div>
        </div>
        {!groups.length ? <p className="text-center text-muted-foreground py-12">{words.length ? "No matching vocabulary" : "Your library is empty"}</p> : <Accordion type="multiple" value={openDates} onValueChange={setOpenDates} aria-label="Vocabulary by date" className="isolate mt-4">
          {groups.map(([date, entries], index) => {
            const paletteIndex = allDates.indexOf(date);
            const swatch = design.dates[paletteIndex % design.dates.length];
            const label = dateLabel(date);
            return <AccordionItem ref={(element) => { dateRefs.current[date] = element; }} value={date} key={date} style={{ ...swatch, zIndex: index }} className={cn("relative border-0 rounded-t-2xl last:rounded-b-2xl", index > 0 && "-mt-3")}>
              <AccordionTrigger className="items-center px-5 sm:px-7 pt-5 pb-8 gap-3 rounded-t-2xl hover:no-underline [&>svg]:text-current [&>svg]:h-5 [&>svg]:w-5 focus-visible:ring-inset">
                <span className="min-w-0 flex-1 text-left text-2xl sm:text-4xl font-black uppercase leading-[0.95] tracking-tighter break-words">{label.title}</span>
                <span className="hidden sm:block w-28 text-left text-xs leading-relaxed">{label.detail}</span>
                <span className="shrink-0 text-right text-sm font-medium">{entries.length}<span className="block text-xs font-normal">{entries.length === 1 ? "item" : "items"}</span></span>
              </AccordionTrigger>
              <AccordionContent className="px-3 sm:px-5 pb-7">
                <div className="space-y-3">
                  {entries.map((word, wordIndex) => <WordSwatch key={word.id} word={word} swatch={design.words[(paletteIndex + (wordIndex % (design.words.length - 1)) + 1) % design.words.length]} />)}
                </div>
              </AccordionContent>
            </AccordionItem>;
          })}
        </Accordion>}
      </>}
    </div>
  </div>;
}
