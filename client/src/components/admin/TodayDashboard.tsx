import { trpc } from "@/lib/trpc";
import type { SidebarTab, ReviewTarget } from "@/types";
import { ArrowRight, BookOpen, Mic, Headphones } from "lucide-react";

export default function TodayDashboard({ name, navigate, review }: {
  name?: string | null; navigate: (tab: SidebarTab) => void; review: (target?: ReviewTarget) => void;
}) {
  const stats = trpc.review.getStats.useQuery();
  const words = trpc.vocab.list.useQuery();
  const due = stats.data?.dueToday ?? 0;
  const total = words.data?.length ?? 0;
  return <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-10 sm:py-12">
    <div className="max-w-4xl mx-auto">
      <p className="text-sm text-muted-foreground">{name ? `Bonjour, ${name.split(" ")[0]}.` : "Bonjour."}</p>
      <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">A little French, today.</h1>
      <p className="text-muted-foreground mt-3">Pick up what you’ve learned, then try something new.</p>
      <section className="mt-8 border-y border-border py-7 sm:py-9" aria-label="Your next practice">
        {stats.isLoading || words.isLoading ? <p role="status">Finding your next practice…</p>
          : stats.isError || words.isError ? <div role="alert"><p>We couldn’t load your practice. Your words are still saved.</p><button className="mt-3 underline" onClick={() => { void stats.refetch(); void words.refetch(); }}>Try again</button></div>
          : <>
            <p className="text-sm font-semibold text-speaking">{due ? "Ready to revisit" : total ? "Your review is up to date" : "Start with a conversation"}</p>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2">{due ? `${due} words ready for review` : total ? "Put your French to use." : "Say your first few words."}</h2>
            <p className="text-muted-foreground mt-2 max-w-lg">{due ? `Start with ${Math.min(due, 10)} words. An estimated ${Math.max(1, Math.ceil(Math.min(due, 10) * 0.3))} minutes, at your pace.` : "Talk about your day, ask a question, or practise a situation you’ll use."}</p>
            <button className="mt-5 inline-flex items-center gap-3 rounded-lg px-5 py-3 bg-primary text-primary-foreground font-semibold" onClick={() => due ? review({ mode: "due", limit: Math.min(due, 10) }) : navigate("voice-chat")}>{due ? "Review now" : "Start a conversation"}<ArrowRight className="w-4 h-4" /></button>
            {!!total && !due && <button className="ml-4 mt-4 underline text-sm" onClick={() => review({ mode: "latest", limit: Math.min(total, 10) })}>Revisit recent words</button>}
          </>}
      </section>
      <h2 className="text-lg font-bold mt-8">Choose your next activity</h2>
      <div className="divide-y border-b border-border mt-3">
        {[
          { tab: "voice-chat" as const, title: "Speak", copy: "Make time for a conversation with Romain or Anna.", icon: Mic },
          { tab: "reading" as const, title: "Read", copy: "Read an article. Tap an unfamiliar word for its meaning.", icon: BookOpen },
          { tab: "listening" as const, title: "Listen", copy: "Follow a video with its French transcript.", icon: Headphones },
        ].map(({tab, title, copy, icon: Icon}) => <button key={tab} onClick={() => navigate(tab)} className="w-full flex items-center gap-4 py-5 text-left hover:text-primary"><Icon className="w-5 h-5 text-speaking shrink-0"/><span className="flex-1"><span className="font-bold block">{title}</span><span className="text-sm text-muted-foreground block mt-1">{copy}</span></span><ArrowRight className="w-4 h-4 shrink-0"/></button>)}
      </div>
      <div className="flex flex-wrap gap-5 mt-6 text-sm"><button className="underline" onClick={() => navigate("library")}>Your vocabulary</button><button className="underline" onClick={() => navigate("progress")}>See what’s sticking</button><a className="underline text-muted-foreground" href="/admin/landing-preview">Preview the new landing page</a></div>
      <details className="mt-8 text-sm text-muted-foreground"><summary className="cursor-pointer">How your practice connects</summary><p className="mt-3 max-w-xl leading-relaxed">Meet words in a conversation, article, or video. Save the ones you need. Review them here, then try using them the next time you speak.</p></details>
    </div>
  </div>;
}
