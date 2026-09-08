import { trpc } from "@/lib/trpc";
import type { ReviewTarget } from "@/types";

export function summarizeLearning(words: { id: number; term: string; translation: string; sm2Repetitions?: number | null; sm2Interval?: number | null; sm2Status?: string | null; wrongCount: number; quizCount: number }[]) {
  const established = words.filter(w => (w.sm2Repetitions ?? 0) >= 3 && (w.sm2Interval ?? 0) >= 7);
  const practising = words.filter(w => (w.sm2Repetitions ?? 0) > 0 && !established.includes(w));
  const revisit = words.filter(w => w.sm2Status === "learning" || (w.wrongCount > 0 && (w.sm2Repetitions ?? 0) === 0)).slice(0, 8);
  return { established, practising, revisit };
}
export default function LearningProgress({ review }: { review: (target?: ReviewTarget) => void }) {
  const query = trpc.vocab.list.useQuery();
  const stats = trpc.review.getStats.useQuery();
  const { established, practising, revisit } = summarizeLearning(query.data ?? []);
  return <div className="flex-1 overflow-y-auto p-5 sm:p-10"><div className="max-w-3xl mx-auto">
    <h1 className="text-3xl font-bold">See what’s sticking.</h1>
    <p className="text-muted-foreground mt-3">Evidence from your vocabulary practice, including self-rated flashcards. This is not a French proficiency score.</p>
    {query.isLoading || stats.isLoading ? <p role="status" className="mt-8">Loading your practice history…</p> : query.isError || stats.isError ? <div role="alert" className="mt-8"><p>We couldn’t load your progress.</p><button className="underline mt-3" onClick={() => { void query.refetch(); void stats.refetch(); }}>Try again</button></div> : !query.data?.length ? <div className="mt-8 border-y py-6"><h2 className="font-bold text-xl">Your first saved word starts the story.</h2><p className="mt-2 text-muted-foreground">Save vocabulary from a conversation, article, or video. Your review results will appear here.</p></div> : <>
      <div className="grid sm:grid-cols-3 gap-6 border-y py-7 mt-8">{[{n:established.length,label:"On longer review intervals",detail:"At least 3 successful ratings in a row; current interval at least 7 days."},{n:practising.length,label:"Building familiarity",detail:"Successful ratings recorded; still establishing a longer interval."},{n:stats.data?.dueToday ?? 0,label:"Ready to review",detail:"New or scheduled words waiting for practice."}].map(s => <div key={s.label}><p className="text-3xl font-bold text-primary">{s.n}</p><h2 className="font-semibold mt-2">{s.label}</h2><p className="text-sm text-muted-foreground mt-2">{s.detail}</p></div>)}</div>
      <h2 className="text-xl font-bold mt-8">Give these another try</h2><p className="text-sm text-muted-foreground mt-2">Words currently learning, or with earlier mistakes and no current run of successful ratings.</p>
      {revisit.length ? <><ul className="divide-y mt-4">{revisit.map(w => <li key={w.id} className="py-3 flex justify-between gap-4"><span className="font-semibold">{w.term}</span><span className="text-muted-foreground">{w.translation}</span></li>)}</ul><button className="mt-5 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-semibold" onClick={() => review({ wordIds: revisit.map(w => w.id) })}>Practise these {revisit.length} words</button></> : <p className="mt-4">No words need extra attention by this measure. Keep practising to build a longer history.</p>}
      <details className="mt-8 text-sm text-muted-foreground"><summary className="cursor-pointer">What these numbers can tell you</summary><p className="mt-3">Review intervals describe your current scheduling state. They do not prove you recalled a word after a week, measure pronunciation, or show changes in speaking fluency. Those claims need separate assessments.</p></details>
    </>}
  </div></div>;
}
