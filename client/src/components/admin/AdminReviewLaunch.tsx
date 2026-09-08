import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { ReviewTarget } from "@/types";
import type { ReviewLaunchChoice } from "@/components/ReviewLaunch";
export default function AdminReviewLaunch({kind, initialTarget, initialDateKey, onStart}: {kind:"quiz"|"flashcards"; initialTarget?:ReviewTarget|null;initialDateKey?:string|null;onStart:(c:ReviewLaunchChoice)=>void}) {
  const stats=trpc.review.getStats.useQuery();
  const dates=trpc.review.getDates.useQuery();
  const [source,setSource]=useState(initialTarget?.wordIds ? "session" : initialTarget?.mode ?? initialDateKey ?? "due");
  const [limit,setLimit]=useState(initialTarget?.limit ?? 10);
  const [front,setFront]=useState<"fr"|"en">("fr");
  const total=dates.data?.reduce((n,d)=>n+d.total,0) ?? 0;
  const count=source==="session" ? new Set(initialTarget?.wordIds).size : source==="due" ? stats.data?.dueToday ?? 0 : source==="latest" ? total : dates.data?.find(d=>d.dateKey===source)?.total ?? 0;
  function start() { onStart({ mode:source==="due"||source==="latest" ? source:"all", dateKey:source!=="session"&&source!=="due"&&source!=="latest" ? source:undefined, wordIds:source==="session" ? initialTarget?.wordIds:undefined, limit:Math.min(limit,count,500), front }); }
  return <div className="flex-1 overflow-y-auto px-5 py-8 sm:p-10"><div className="max-w-lg mx-auto">
    <p className="text-sm text-speaking">{kind==="quiz" ? "Recall practice":"Vocabulary practice"}</p><h1 className="text-3xl font-bold mt-2">{source==="session" ? "Practise these words." : "Make the words familiar."}</h1>
    <p className="text-muted-foreground mt-3">{source==="session" ? "Only the selected saved words are included. Deleted words are skipped." : "A short review is enough. Choose your words and start."}</p>
    {stats.isLoading||dates.isLoading ? <p role="status" className="mt-6">Loading your words…</p> : stats.isError||dates.isError ? <div role="alert" className="mt-6"><p>We couldn’t load your review queue.</p><button className="underline mt-3" onClick={()=>{void stats.refetch();void dates.refetch();}}>Try again</button></div> : <div className="mt-7 space-y-5">
      <label className="block text-sm font-semibold">Words to practise<select value={source} onChange={e=>setSource(e.target.value)} className="block w-full border rounded-lg bg-card p-3 mt-2">{initialTarget?.wordIds?.length && <option value="session">Selected words ({new Set(initialTarget.wordIds).size})</option>}<option value="due">Ready for review ({stats.data?.dueToday ?? 0})</option><option value="latest">Recently saved</option>{dates.data?.map(d=><option key={d.dateKey} value={d.dateKey}>{d.dateKey} · {d.total} words</option>)}</select></label>
      {count ? <><label className="block text-sm font-semibold">Session size<select value={Math.min(limit,count,500)} onChange={e=>setLimit(Number(e.target.value))} className="block w-full border rounded-lg bg-card p-3 mt-2">{Array.from(new Set([Math.min(limit,count,500),...[5,10,20,50].filter(n=>n<count),Math.min(count,500)])).sort((a,b)=>a-b).map(n=><option key={n} value={n}>{Math.min(n,count)} words</option>)}</select></label>{kind==="flashcards"&&<label className="block text-sm font-semibold">Show first<select className="block w-full border rounded-lg bg-card p-3 mt-2" value={front} onChange={e=>setFront(e.target.value as "fr"|"en")}><option value="fr">French</option><option value="en">English</option></select></label>}<button disabled={kind==="quiz"&&Math.min(count,limit)<2} onClick={start} className="rounded-lg bg-primary text-primary-foreground py-3 px-6 font-semibold disabled:opacity-50">Start {kind==="quiz" ? "quiz":"review"}</button>{kind==="quiz"&&count<2&&<p className="text-sm">A quiz needs at least two words. You can review a single word in Flashcards.</p>}</> : <p>No words in this selection. Choose another source, or save a word from a conversation, article, or video.</p>}
    </div>}
  </div></div>;
}
