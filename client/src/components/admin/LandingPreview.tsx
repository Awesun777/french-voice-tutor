import { usePronounce } from "@/lib/pronounce";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { canUseAdminPreview } from "@/contexts/AdminPreviewContext";
import { PronounceButton } from "@/components/PronounceButton";

export default function LandingPreview() {
  const { user, loading } = useAuth();
  const pronunciation = usePronounce();
  const [meaning, setMeaning] = useState(false);
  const [auth, setAuth] = useState(false);
  const [help, setHelp] = useState(false);
  if (loading) return <p role="status" className="p-8">Checking access…</p>;
  if (!canUseAdminPreview(user)) return <div className="p-8"><h1 className="text-2xl font-bold">Admin preview</h1><p className="mt-3">Sign in with an admin account to view this page.</p><a className="underline inline-block mt-4" href="/">Return to sign in</a></div>;
  return <div className="min-h-screen bg-background text-foreground">
    <div className="bg-primary text-primary-foreground px-5 py-3 text-sm flex flex-wrap gap-3 justify-between"><span>Admin preview · Public landing page unchanged</span><a href="/#dashboard" className="underline">Back to the app</a></div>
    <div className="max-w-6xl mx-auto px-6 sm:px-12">
      <header className="flex justify-between items-center py-7 border-b"><img src="/brand/romaintalk-wordmark.png" alt="RomainTalk" className="w-36"/><button onClick={() => setAuth(!auth)} className="underline text-sm">Sign-in preview</button></header>
      <main className="grid lg:grid-cols-2 gap-10 lg:gap-16 py-12 sm:py-20 items-center">
        <div><p className="text-speaking font-semibold text-sm">French for the things you want to say.</p><h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.08] mt-5">Find your words.<br/>Then use them.</h1><p className="text-lg text-muted-foreground mt-6 leading-relaxed max-w-lg">Talk with a French tutor. Read an article or follow a video. Keep the words you need, and practise them until they feel familiar.</p><a href="/#voice-chat" className="inline-block mt-7 rounded-lg px-6 py-3 bg-primary text-primary-foreground font-semibold">Try a conversation</a><p className="text-sm text-muted-foreground mt-3">Romain and Anna are AI conversation tutors.</p></div>
        <section className="border-y border-primary/30 py-7" aria-label="Interactive vocabulary example"><p className="text-sm text-muted-foreground">A small taste of how it works</p><p lang="fr" className="font-serif text-3xl sm:text-4xl leading-relaxed mt-5">Je suis <button aria-expanded={meaning} aria-controls="sample-meaning" onClick={() => setMeaning(!meaning)} className="border-b-2 border-speaking text-speaking focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">en train de</button> lire le journal.</p><p className="text-sm text-muted-foreground mt-5">Tap “en train de” to see its meaning.</p>{meaning && <div id="sample-meaning" className="bg-white border-l-4 border-speaking p-5 mt-5"><div className="flex justify-between gap-4"><h2 className="font-bold">en train de</h2><PronounceButton text="en train de" {...pronunciation} className="p-3" /></div><p className="mt-2">In the middle of doing something.</p><p className="text-sm text-muted-foreground mt-3">Here: “I’m reading the newspaper.”</p></div>}</section>
      </main>
      {auth && <section className="max-w-md border p-6 mb-10 rounded-lg" aria-label="Sign-in layout preview"><h2 className="text-xl font-bold">Welcome back</h2><p className="text-sm text-muted-foreground mt-2">Layout preview only. This form does not submit or change your account.</p><label className="block mt-5 text-sm font-semibold" htmlFor="preview-email">Email</label><input id="preview-email" type="email" autoComplete="off" placeholder="you@example.com" className="w-full border rounded-md p-3 mt-2"/><label className="block mt-4 text-sm font-semibold" htmlFor="preview-password">Password</label><input id="preview-password" type="password" autoComplete="off" placeholder="Password" className="w-full border rounded-md p-3 mt-2"/><button onClick={() => setHelp(!help)} aria-expanded={help} className="underline text-sm mt-3">Forgot password?</button>{help && <p className="text-sm mt-3 text-muted-foreground">Password-reset email delivery is not configured in this preview. No reset email will be sent. The public sign-in remains unchanged.</p>}<button disabled className="block mt-5 bg-primary/60 text-primary-foreground rounded-md py-3 w-full">Sign in · preview only</button></section>}
      <section className="grid md:grid-cols-3 gap-8 py-8 border-t">{[{n:"01",title:"Have a conversation",body:"Speak with Romain or Anna and save useful vocabulary as you go."},{n:"02",title:"Follow your interests",body:"Read French articles or watch videos with a transcript and word meanings."},{n:"03",title:"Remember what you found",body:"Come back to your saved words with flashcards and quizzes."}].map(s => <div key={s.n}><span className="text-speaking text-sm">{s.n}</span><h2 className="font-bold text-lg mt-3">{s.title}</h2><p className="text-muted-foreground mt-2 leading-relaxed">{s.body}</p></div>)}</section>
      <footer className="border-t py-6 mt-8 text-sm text-muted-foreground flex justify-between"><span>RomainTalk</span><a href="/privacy" className="underline">Privacy policy</a></footer>
    </div>
  </div>;
}
