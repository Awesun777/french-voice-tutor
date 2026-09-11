import { useState } from "react";
import { ArrowLeft, Search, Star, X, BookOpen, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { VocabEntry } from "@/types";
import { vocabularyStage } from "@/lib/vocabularySummary";

export type LibraryDemoVariant = "compact" | "cards" | "notebook";
const designs = [
  { id: "compact", name: "Compact list", description: "A clear French–English column layout for scanning a growing collection." },
  { id: "cards", name: "Flashcard grid", description: "Room for each word to breathe, with its meaning and source kept together." },
  { id: "notebook", name: "Learning notebook", description: "A dated journal of the words and phrases you meet along the way." },
] as const;

function dateLabel(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function Status({ word }: { word: VocabEntry }) {
  const stage = vocabularyStage(word);
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", stage === "mastered" ? "bg-primary text-primary-foreground" : stage === "learning" ? "bg-star/15 text-primary" : "bg-secondary text-primary")}>
    {word.starred && <Star className="h-3 w-3 fill-current" aria-label="Starred" />}
    {stage === "new" ? "New" : stage === "learning" ? "Learning" : "Mastered"}
  </span>;
}

export default function LibraryDesignDemo({ variant }: { variant: LibraryDemoVariant }) {
  const { data: words = [], isLoading, isError } = trpc.vocab.list.useQuery();
  const [search, setSearch] = useState("");
  const [starred, setStarred] = useState(false);
  const design = designs.find((item) => item.id === variant)!;
  const query = search.trim().toLocaleLowerCase();
  const filtered = words.filter((word) => (!starred || word.starred) && (!query || [word.term, word.translation, word.lessonSource, word.groupLabel].some((value) => value?.toLocaleLowerCase().includes(query))));
  const grouped = filtered.reduce<Record<string, VocabEntry[]>>((groups, word) => {
    (groups[word.dateKey] ??= []).push(word);
    return groups;
  }, {});
  const groups = Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a));

  const searchControl = (
    <div className={cn("flex flex-wrap items-center gap-3", variant === "compact" && "rounded-2xl bg-secondary/60 p-3", variant === "cards" && "rounded-3xl bg-card p-3 shadow-sm", variant === "notebook" && "border-y border-primary/15 py-4")}>
      <div className="relative flex-1 min-w-0 basis-40">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" aria-hidden="true" />
        <input aria-label="Search vocabulary demos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={variant === "notebook" ? "Find a word in your notes…" : "Search French, English, or source…"} className={cn("w-full min-h-11 pl-10 pr-10 text-base text-primary placeholder:text-primary/60 focus-visible:outline-2 focus-visible:outline-primary", variant === "compact" ? "rounded-xl bg-card" : variant === "cards" ? "rounded-full bg-background" : "bg-transparent rounded-lg")} />
        {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center text-primary"><X className="h-4 w-4" /></button>}
      </div>
      <button type="button" aria-pressed={starred} onClick={() => setStarred(!starred)} className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold", starred ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/5")}><Star className={cn("h-4 w-4", starred && "fill-current")} />Starred</button>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm mb-4">
          <a href="#library" className="inline-flex items-center gap-2 text-primary hover:underline"><ArrowLeft className="h-4 w-4" />My Library</a>
          <span className="text-muted-foreground">Admin preview · read-only vocabulary</span>
        </div>
        <nav aria-label="Library design previews" className="flex flex-wrap gap-2 mb-6">
          {designs.map((item) => <a key={item.id} href={`#library-demo-${item.id}`} aria-current={variant === item.id ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-sm font-semibold", variant === item.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-primary hover:bg-secondary")}>{item.name}</a>)}
        </nav>
        <p className="text-xs uppercase tracking-[0.18em] text-primary/60 mb-2">My vocabulary</p>
        <h1 className={cn("text-primary mb-2", variant === "notebook" ? "font-serif italic text-4xl sm:text-5xl" : "font-display font-bold text-3xl sm:text-4xl")}>{design.name}</h1>
        <p className="text-base text-muted-foreground mb-6 max-w-xl">{design.description}</p>
        {searchControl}
        <p className="mt-4 mb-5 text-sm text-muted-foreground" aria-live="polite">{filtered.length} of {words.length} vocab items{starred ? " · starred" : ""}</p>
        {isLoading ? <div role="status" className="py-10 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading vocabulary…</div> : isError ? <p role="alert" className="py-8 text-destructive">Couldn't load your vocabulary. Please try again later.</p> : groups.length === 0 ? <div className="py-12 text-center text-muted-foreground"><BookOpen className="h-8 w-8 mx-auto mb-3" /><p>{words.length ? "No matching vocabulary" : "Your library is empty"}</p></div> : (
          <div className="space-y-7">
            {groups.map(([date, entries]) => (
              <section key={date} aria-label={dateLabel(date)} className={cn(variant === "notebook" && "grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]")}>
                <div className={cn("flex items-center gap-2 mb-3", variant === "notebook" && "sm:block sm:border-l-2 sm:border-primary/20 sm:pl-4")}>
                  <h2 className={cn("text-primary", variant === "notebook" ? "font-serif text-lg" : "text-sm font-semibold")}>{dateLabel(date)}</h2>
                  <span className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "item" : "items"}</span>
                </div>
                {variant === "compact" ? (
                  <div className="overflow-hidden rounded-2xl border border-primary/10 bg-card">
                    <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px] gap-4 px-5 py-2 bg-secondary/40 text-xs text-primary/70"><span>French</span><span>English</span><span>Status</span></div>
                    {entries.map((word) => <div key={word.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px] sm:gap-4 px-5 py-4 border-t border-primary/5 hover:bg-secondary/15">
                      <div className="min-w-0"><p className="font-semibold text-base text-primary break-words">{word.term}</p>{word.lessonSource && <p className="text-xs text-muted-foreground mt-1 break-words">{word.lessonSource}</p>}</div>
                      <p className="text-base text-foreground/80 break-words">{word.translation}</p><div><Status word={word} /></div>
                    </div>)}
                  </div>
                ) : variant === "cards" ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {entries.map((word) => <article key={word.id} className="flex flex-col rounded-t-3xl rounded-b-xl border border-b-4 border-primary/10 bg-card p-5">
                      <div className="flex justify-between items-center gap-2 mb-5"><span className="text-xs text-primary/60 uppercase tracking-wider">{word.entryKind}</span><Status word={word} /></div>
                      <p className="font-display font-bold text-2xl leading-tight text-primary break-words">{word.term}</p>
                      <p className="text-base text-foreground/75 mt-3 mb-6 break-words">{word.translation}</p>
                      <p className="mt-auto pt-3 border-t border-primary/10 text-xs text-muted-foreground break-words">{word.lessonSource || word.groupLabel || dateLabel(date)}</p>
                    </article>)}
                  </div>
                ) : (
                  <div className="rounded-r-2xl border-l border-star/40 bg-card/70 px-5 sm:px-7">
                    {entries.map((word) => <article key={word.id} className="py-5 border-b last:border-b-0 border-primary/10">
                      <div className="flex flex-wrap items-start justify-between gap-3"><p className="min-w-0 flex-1 basis-40 font-serif text-2xl text-primary break-words">{word.term}</p><Status word={word} /></div>
                      <p className="mt-2 text-base text-foreground/80 break-words">{word.translation}</p>
                      {(word.lessonSource || word.groupLabel) && <p className="mt-3 text-sm italic text-muted-foreground break-words">From {word.lessonSource || word.groupLabel}</p>}
                    </article>)}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
