import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, History, Star, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { VocabHeatmap } from "./VocabHeatmap";

export interface ReviewLaunchChoice {
  mode: "due" | "all" | "latest" | "starred";
  dateKey?: string;
  limit?: number;
  front?: "fr" | "en";
}
interface ReviewLaunchProps {
  kind: "quiz" | "flashcards";
  initialDateKey?: string | null;
  onStart: (choice: ReviewLaunchChoice) => void;
  header?: React.ReactNode;
}

function LanguageSwipe({ value, onChange }: { value: "fr" | "en"; onChange: (v: "fr" | "en") => void }) {
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  const english = value === "en";
  return <button type="button" role="switch" aria-label="Show English first" aria-checked={english}
    onPointerDown={e => { if (e.button !== 0) return; suppressClick.current = false; drag.current = { x: e.clientX, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (!drag.current) return; const delta = e.clientX - drag.current.x; if (Math.abs(delta) > 5) drag.current.moved = true; if (drag.current.moved) setOffset(Math.max(0, Math.min(162, (english ? 162 : 0) + delta))); }}
    onPointerUp={e => { const d = drag.current; drag.current = null; if (d?.moved) { suppressClick.current = true; onChange((english ? 162 : 0) + e.clientX - d.x > 81 ? "en" : "fr"); } setOffset(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { drag.current = null; setOffset(null); }}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onChange(english ? "fr" : "en"); }}
    onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onChange(e.key === "ArrowRight" ? "en" : "fr"); } }}
    className={cn("relative h-12 w-[210px] shrink-0 touch-pan-y select-none rounded-full text-white text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary", english ? "bg-[#A63D4A] pl-3 pr-12" : "bg-[#244FA0] pl-12 pr-3")}>
    <span aria-hidden="true" style={{ transform: `translateX(${offset ?? (english ? 162 : 0)}px)` }} className={cn("absolute top-[3px] left-[3px] grid h-[42px] w-[42px] place-items-center rounded-full bg-white", offset === null && "transition-transform motion-reduce:transition-none", english ? "text-[#A63D4A]" : "text-[#244FA0]")}>
      <ChevronRight className={cn("h-4 w-4", english && "rotate-180")} />
      <span className="absolute bottom-1 left-2.5 h-2 w-[22px]" style={{ background: english ? "linear-gradient(90deg, transparent 42%, #BD3342 42% 58%, transparent 58%), linear-gradient(transparent 35%, #BD3342 35% 65%, transparent 65%), white" : "linear-gradient(90deg, #244FA0 33%, white 33% 66%, #CF3544 66%)" }} />
    </span>
    {english ? "Show English" : "Show French"}
  </button>;
}

export default function ReviewLaunch({ kind, initialDateKey, onStart }: ReviewLaunchProps) {
  const statsQ = trpc.review.getStats.useQuery();
  const datesQ = trpc.review.getDates.useQuery();
  const stats = statsQ.data;
  const dates = datesQ.data ?? [];
  const [source, setSource] = useState<string | null>(initialDateKey ?? null);
  const [front, setFront] = useState<"fr" | "en">("fr");
  const remaining = stats?.dueToday ?? 0;
  const reviewed = stats?.reviewedToday ?? 0;
  const total = remaining + reviewed;
  const percent = total ? Math.round(reviewed / total * 100) : 0;
  const allWords = dates.reduce((n, d) => n + d.total, 0);
  const available = source === "due" ? remaining : source === "latest" ? allWords : source === "starred" ? stats?.starred ?? 0 : dates.find(d => d.dateKey === source)?.total ?? 0;
  const max = Math.min(available, 500);
  const label = source === "due" ? "Due today" : source === "latest" ? "Latest saved words" : source === "starred" ? "Starred words" : source ? new Date(source + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  function start(limit: number) {
    if (!source) return;
    onStart({ mode: source === "due" || source === "latest" || source === "starred" ? source : "all", dateKey: ["due", "latest", "starred"].includes(source) ? undefined : source, limit, front });
  }
  const primary = "rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-bold disabled:opacity-40 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return <div className="flex-1 min-h-0 overflow-y-auto bg-background px-4 py-5 sm:px-6">
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight mb-5">{kind === "quiz" ? "Quiz" : "Flashcards"}</h1>
      {statsQ.isLoading ? <div className="p-12 flex justify-center"><Loader2 aria-label="Loading review counts" className="animate-spin" /></div> : statsQ.isError ? <div role="alert" className="p-6">Couldn’t load your review counts. <button onClick={() => statsQ.refetch()} className="underline">Try again</button></div> : <section aria-label="Daily review summary" className="bg-card border border-foreground/10 rounded-3xl px-5 sm:px-7 py-5">
        <p className="text-xs text-muted-foreground">YOUR DAILY REVIEW</p>
        <div className="flex flex-wrap items-center justify-between gap-5 mt-2 mb-5">
          <div><div className="text-7xl sm:text-8xl font-black leading-none tracking-tighter tabular-nums">{remaining.toLocaleString()}</div><p className="text-lg font-bold mt-2">words left to review</p></div>
          <div className="flex flex-col gap-2.5"><button disabled={!remaining} onClick={() => setSource("due")} className={primary}>{remaining ? "Start review" : "All caught up"}</button><LanguageSwipe value={front} onChange={setFront} /></div>
        </div>
        <div role="progressbar" aria-label="Daily review progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 rounded-full overflow-hidden bg-primary/10"><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{reviewed} of {total} reviewed today (UTC)</span><span>{percent}%</span></div>
        <div className="grid grid-cols-3 mt-4">{[{ label: "LEFT TO REVIEW", n: remaining }, { label: "REVIEWED TODAY", n: reviewed }, { label: "DAILY QUEUE", n: total }].map(s => <div key={s.label} className="text-center py-2 px-1 border-r border-foreground/10 last:border-0"><p className="text-[11px] text-muted-foreground">{s.label}</p><strong className="text-2xl sm:text-3xl tracking-tight tabular-nums">{s.n.toLocaleString()}</strong></div>)}</div>
      </section>}
      {source ? <section className="py-7">
        <button onClick={() => setSource(null)} className="text-sm text-muted-foreground flex items-center gap-1 mb-6"><ChevronLeft className="w-4 h-4" /> Choose words</button>
        <h2 className="text-2xl font-bold">{label}</h2><p className="text-sm text-muted-foreground mt-1">{available} words available{source === "latest" ? " · newest first" : ""}</p>
        <p className="font-semibold mt-6 mb-3">How many words?</p>
        <div className="flex flex-wrap gap-3">{[10,20,30,50].filter(n => n < max && (kind !== "quiz" || n > 1)).map(n => <button key={n} onClick={() => start(n)} className="bg-card border border-foreground/15 rounded-xl px-6 py-3 font-semibold hover:border-primary">{n}</button>)}<button disabled={max < (kind === "quiz" ? 2 : 1)} onClick={() => start(max)} className={primary}>{available > 500 ? "Review 500 words" : `All ${max} words`} <ArrowRight className="inline w-4 h-4 ml-1" /></button></div>
        {max < (kind === "quiz" ? 2 : 1) && <p className="text-sm text-muted-foreground mt-4">{kind === "quiz" ? "Choose at least two words for a quiz." : "No words in this collection yet."}</p>}
      </section> : <section className="pt-7">
        <h2 className="text-base font-bold mb-2">Or choose your words</h2>
        {[{ id: "latest", title: "Latest saved words", text: "Pick up where your curiosity left off", count: allWords, icon: History }, { id: "starred", title: "Starred words", text: "A little extra practice for your favourites", count: stats?.starred ?? 0, icon: Star }].map(row => <button key={row.id} onClick={() => setSource(row.id)} className="flex w-full items-center gap-3 text-left py-5 border-b border-foreground/15 hover:text-primary"><row.icon className="w-5 h-5 text-primary shrink-0" /><span className="flex-1"><strong className="text-sm block">{row.title}</strong><span className="text-xs text-muted-foreground">{row.text}</span></span><span className="text-xs text-muted-foreground">{row.count} words</span><ArrowRight className="w-4 h-4 shrink-0" /></button>)}
        <div className="mt-7">{datesQ.isError ? <button onClick={() => datesQ.refetch()} className="text-sm underline">Retry loading saved days</button> : dates.length ? <VocabHeatmap dates={dates} tone="blue" stretch onPick={setSource} idleLabel="Saved words · pick a day" /> : <p className="text-sm text-muted-foreground">{datesQ.isLoading ? "Loading saved days…" : "Save words in your library to start reviewing."}</p>}</div>
      </section>}
    </div>
  </div>;
}
