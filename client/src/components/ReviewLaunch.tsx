import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, History, Star, Shuffle, Loader2, Settings2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { VocabHeatmap } from "./VocabHeatmap";

export interface ReviewLaunchChoice {
  mode: "due" | "all" | "latest" | "starred" | "shuffle";
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

function DailyReviewSettings() {
  const [open, setOpen] = useState(false);
  const [newWords, setNewWords] = useState<string | null>(null);
  const [reviews, setReviews] = useState<string | null>(null);
  const settings = trpc.review.getSettings.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();
  const save = trpc.review.updateSettings.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.review.getSettings.invalidate(), utils.review.getStats.invalidate(), utils.review.getDueToday.invalidate()]);
      setOpen(false);
    },
  });
  const newValue = newWords ?? String(settings.data?.dailyNewWords ?? 10);
  const reviewValue = reviews ?? String(settings.data?.dailyReviewCap ?? 20);
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) { setNewWords(null); setReviews(null); save.reset(); } }}>
    <DialogTrigger asChild><button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><Settings2 className="h-4 w-4" /> Settings</button></DialogTrigger>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Daily review settings</DialogTitle><DialogDescription>Set your daily queue for Flashcards and Quiz. Custom word selections use the session size you choose.</DialogDescription></DialogHeader>
      {settings.isLoading ? <p role="status">Loading settings…</p> : settings.isError ? <button onClick={() => settings.refetch()} className="underline">Retry loading settings</button> : <form className="space-y-5" onSubmit={e => { e.preventDefault(); save.mutate({ dailyNewWords: Number(newValue), dailyReviewCap: Number(reviewValue) }); }}>
        <label className="block text-sm font-medium">New words per day<input type="number" required min={1} max={50} step={1} value={newValue} onChange={e => setNewWords(e.target.value)} className="mt-2 w-full border-b border-foreground/25 bg-transparent py-2 text-xl outline-primary" /></label>
        <label className="block text-sm font-medium">Review words per day<input type="number" required min={1} max={100} step={1} value={reviewValue} onChange={e => setReviews(e.target.value)} className="mt-2 w-full border-b border-foreground/25 bg-transparent py-2 text-xl outline-primary" /></label>
        {save.isError && <p role="alert" className="text-sm text-destructive">Couldn’t save settings. Please try again.</p>}
        <button disabled={save.isPending} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{save.isPending ? "Saving…" : "Save changes"}</button>
      </form>}
    </DialogContent>
  </Dialog>;
}

export default function ReviewLaunch({ kind, initialDateKey, onStart }: ReviewLaunchProps) {
  const statsQ = trpc.review.getStats.useQuery();
  const datesQ = trpc.review.getDates.useQuery();
  const stats = statsQ.data;
  const dates = datesQ.data ?? [];
  const [source, setSource] = useState<string | null>(initialDateKey ?? null);
  const [front, setFront] = useState<"fr" | "en">("fr");
  const flashcards = kind === "flashcards";
  const chooseSource = setSource;
  const remaining = stats?.dueToday ?? 0;
  const reviewed = stats?.reviewedToday ?? 0;
  const total = remaining + reviewed;
  const percent = total ? Math.round(reviewed / total * 100) : 0;
  const allWords = dates.reduce((n, d) => n + d.total, 0);
  const available = source === "due" ? remaining : source === "latest" || source === "shuffle" ? allWords : source === "starred" ? stats?.starred ?? 0 : dates.find(d => d.dateKey === source)?.total ?? 0;
  const max = Math.min(available, 500);
  const label = source === "shuffle" ? "Shuffle" : source === "due" ? "Due today" : source === "latest" ? "Latest saved words" : source === "starred" ? "Starred words" : source ? new Date(source + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  function start(limit: number) {
    if (!source) return;
    onStart({ mode: source === "due" || source === "latest" || source === "starred" || source === "shuffle" ? source : "all", dateKey: ["due", "latest", "starred", "shuffle"].includes(source) ? undefined : source, limit, front });
  }
  const primary = "rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-bold disabled:opacity-40 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  return <div className="flex-1 min-h-0 overflow-y-auto bg-background px-4 py-5 sm:px-6">
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight mb-5">{kind === "quiz" ? "Quiz" : "Flashcards"}</h1>
      {statsQ.isLoading ? <div className="p-12 flex justify-center"><Loader2 aria-label="Loading review counts" className="animate-spin" /></div> : statsQ.isError ? <div role="alert" className="p-6">Couldn’t load your review counts. <button onClick={() => statsQ.refetch()} className="underline">Try again</button></div> : <section aria-label="Daily review summary" className="bg-card border border-foreground/10 rounded-3xl px-5 sm:px-7 py-5">
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">YOUR DAILY REVIEW</p>{flashcards && <DailyReviewSettings />}</div>
        <div className="flex flex-wrap items-center justify-between gap-5 mt-2 mb-5">
          <div><div className="text-7xl sm:text-8xl font-black leading-none tracking-tighter tabular-nums">{remaining.toLocaleString()}</div><p className="text-lg font-bold mt-2">words left to review</p></div>
          <div className="flex flex-col gap-2.5">{!flashcards && <button disabled={!remaining} onClick={() => setSource("due")} className={primary}>{remaining ? "Start review" : "All caught up"}</button>}<LanguageSwipe value={front} onChange={setFront} /></div>
        </div>
        <div role="progressbar" aria-label="Daily review progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 rounded-full overflow-hidden bg-primary/10"><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{reviewed} of {total} reviewed today (UTC)</span><span>{percent}%</span></div>
        {!flashcards && <div className="grid grid-cols-3 mt-4">{[{ label: "LEFT TO REVIEW", n: remaining }, { label: "REVIEWED TODAY", n: reviewed }, { label: "DAILY QUEUE", n: total }].map(s => <div key={s.label} className="text-center py-2 px-1 border-r border-foreground/10 last:border-0"><p className="text-[11px] text-muted-foreground">{s.label}</p><strong className="text-2xl sm:text-3xl tracking-tight tabular-nums">{s.n.toLocaleString()}</strong></div>)}</div>}
        {flashcards && <div className="mt-6 border-t border-foreground/20 pt-4">
          <div className="flex items-center justify-between gap-3 min-h-8 mb-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{source ? `${label} · How many words?` : "Choose your words"}</p>
            {source && <button onClick={() => chooseSource(null)} className="flex items-center text-xs gap-1 hover:underline"><ChevronLeft className="w-3 h-3" /> Change</button>}
          </div>
          <div className="relative min-h-24">
            <div className="w-full min-h-24">
              <div className="flex min-h-24">
                {source ? <div className="grid w-full grid-cols-3 sm:grid-cols-5">
                  {[10, 20, 30, 50].filter(n => n < max).map(n => <button key={n} onClick={() => start(n)} className="py-4 border-r border-foreground/15 hover:bg-foreground/5 focus-visible:bg-foreground/5"><strong className="block text-2xl sm:text-3xl font-black tracking-tighter tabular-nums leading-none">{n}</strong><span className="text-xs text-muted-foreground">words</span></button>)}
                  <button disabled={!max} onClick={() => start(max)} className="py-4 hover:bg-foreground/5 disabled:opacity-40"><strong className="block text-2xl sm:text-3xl font-black tracking-tighter leading-none">{available > 500 ? "500" : "All"}</strong><span className="text-xs text-muted-foreground">{max} words <ArrowRight className="inline w-3 h-3" /></span></button>
                </div> : <div className="grid w-full grid-cols-3">
                  {[{ id: "shuffle", title: "Shuffle", icon: Shuffle }, { id: "latest", title: "From the latest", icon: History }, { id: "starred", title: "Starred Words", icon: Star }].map(item => <button key={item.id} disabled={datesQ.isLoading} onClick={() => chooseSource(item.id)} className="flex flex-col sm:flex-row items-center justify-center gap-3 px-2 py-5 border-r border-foreground/15 last:border-0 hover:bg-foreground/5 focus-visible:bg-foreground/5 text-sm font-black capitalize sm:uppercase tracking-tight"><item.icon className="w-5 h-5 shrink-0" />{item.title}</button>)}
                </div>}
              </div>
            </div>
          </div>
          {source && !max && <p className="text-sm text-muted-foreground mt-2">No words in this collection yet.</p>}
        </div>}
      </section>}
      {flashcards ? <div className="mt-7">{datesQ.isError ? <button onClick={() => datesQ.refetch()} className="text-sm underline">Retry loading saved days</button> : dates.length ? <VocabHeatmap dates={dates} tone="red" stretch onPick={chooseSource} idleLabel="Saved words · pick a day" /> : <p className="text-sm text-muted-foreground">{datesQ.isLoading ? "Loading saved days…" : "Save words in your library to start reviewing."}</p>}</div> : source ? <section className="py-7">
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
