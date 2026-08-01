/**
 * LandingPage — what a signed-out visitor sees.
 *
 * Kept in step with the app it is advertising: it leads with the same two
 * pillars as the dashboard (speaking, and doing what you'd do anyway), uses the
 * RomainTalk mark rather than a flag emoji, and lists what the product actually
 * does now — voice tutors, glossed video and article reading — instead of the
 * four features it shipped with.
 */
import { motion, useReducedMotion } from "framer-motion";
import { getLoginUrl } from "@/const";
import { AvatarVideo } from "@/components/AvatarVideo";
import { Mic, Newspaper, Youtube, BookOpen, Brain, CreditCard, GraduationCap } from "lucide-react";

/** Rise-in, with each element owning its delay rather than inheriting a stagger. */
function Rise({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

const SUPPORTING = [
  { icon: <BookOpen className="w-4 h-4" />, label: "AI dictionary" },
  { icon: <Brain className="w-4 h-4" />, label: "Spaced repetition" },
  { icon: <CreditCard className="w-4 h-4" />, label: "Flashcards" },
  { icon: <GraduationCap className="w-4 h-4" />, label: "Grammar drills" },
];

function GoogleButton() {
  const reduce = useReducedMotion();
  return (
    <motion.a
      href={getLoginUrl()}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      className="inline-flex items-center justify-center gap-3 px-7 py-3.5 rounded-2xl bg-card text-foreground font-bold shadow-[0_10px_28px_-10px_rgb(23_63_107_/_0.45)] hover:shadow-[0_16px_36px_-12px_rgb(23_63_107_/_0.55)] transition-shadow"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continue with Google
    </motion.a>
  );
}

export default function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      {/* Same drifting fields as the dashboard, so the signed-out page and the
          signed-in one read as one product. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[34rem] h-[34rem] -top-48 -left-32 rounded-full bg-accent/25 blur-3xl"
          animate={reduce ? undefined : { x: [0, 40, -20, 0], y: [0, 30, 50, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[28rem] h-[28rem] top-1/3 -right-28 rounded-full bg-speaking/15 blur-3xl"
          animate={reduce ? undefined : { x: [0, -35, 15, 0], y: [0, -25, -45, 0] }}
          transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative max-w-4xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
        {/* ── Hero ── */}
        <Rise className="flex flex-col items-center text-center">
          <div className="relative">
            <div aria-hidden className="absolute inset-0 -m-4 rounded-full bg-accent/25 blur-2xl" />
            <motion.img
              src="/brand/romaintalk-icon.png"
              alt=""
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-3xl shadow-[0_14px_34px_-14px_rgb(23_63_107_/_0.55)]"
              animate={reduce ? undefined : { y: [0, -7, 0] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          {/* Real text, not the wordmark image. Google's OAuth verification
              checks that the app name on the consent screen appears on the home
              page, and an <img alt> does not satisfy it. Reproduces the
              wordmark's own two-tone treatment. */}
          <p className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-6">
            <span className="text-primary">Romain</span>
            <span className="text-speaking">Talk</span>
          </p>
        </Rise>

        <Rise delay={0.08} className="text-center mt-5">
          <h1 className="font-display text-3xl sm:text-5xl font-bold text-foreground leading-[1.1] max-w-2xl mx-auto">
            Stop studying French. Start using it.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
            Talk to a tutor who talks back, and read the news and watch the videos you'd be
            scrolling through anyway — with every word one hover from its meaning.
          </p>
        </Rise>

        <Rise delay={0.16} className="flex flex-col items-center mt-8">
          <GoogleButton />
          <p className="text-xs text-muted-foreground mt-3">Free to use · Your data stays private</p>
        </Rise>

        {/* ── The two pillars, mirroring the dashboard ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-14">
          <Rise delay={0.24}>
            <div className="h-full rounded-3xl bg-primary text-primary-foreground p-6 shadow-[0_18px_44px_-18px_rgb(23_63_107_/_0.8)]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">
                <Mic className="w-3.5 h-3.5" /> Speaking
              </div>
              <h2 className="font-display text-xl font-bold mt-2">Learn by Speaking</h2>
              <p className="text-sm text-primary-foreground/80 mt-2 leading-relaxed">
                Real voice conversations with Romain and Anna. They correct you as you go, and any
                word you stumble on goes straight to your library.
              </p>
              <div className="flex items-center gap-3 mt-5">
                {[
                  { src: "/avatars/romain.mp4", name: "Romain" },
                  { src: "/avatars/anna.mp4", name: "Anna" },
                ].map((a) => (
                  <div key={a.name} className="flex items-center gap-2">
                    <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white/25 flex-shrink-0">
                      <AvatarVideo src={a.src} />
                    </div>
                    <span className="text-sm font-semibold">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </Rise>

          <Rise delay={0.32}>
            <div className="h-full rounded-3xl bg-card p-6 shadow-[0_10px_30px_-14px_rgb(23_63_107_/_0.45)]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-speaking">
                <Newspaper className="w-3.5 h-3.5" /> Everyday
              </div>
              <h2 className="font-display text-xl font-bold text-foreground mt-2">Learn by Doing</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                French news and YouTube, with a live transcript. Hover any word or idiom for an
                instant meaning — no dictionary tab, no copy-paste.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-speaking-surface text-speaking text-xs font-bold">
                  <Youtube className="w-3.5 h-3.5" /> Watch
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-primary text-xs font-bold">
                  <Newspaper className="w-3.5 h-3.5" /> Read
                </span>
              </div>
              {/* A concrete sample of the thing being described, since "hover for
                  the meaning" is hard to picture from a sentence. */}
              <div className="mt-4 rounded-2xl bg-background px-4 py-3 text-sm leading-8 text-foreground">
                Je suis{" "}
                <span className="border-b-2 border-dashed border-speaking/60 bg-speaking-surface rounded px-0.5">
                  en train de
                </span>{" "}
                <span className="border-b border-dashed border-muted-foreground/40">lire</span> le
                journal.
              </div>
            </div>
          </Rise>
        </div>

        {/* ── Everything else, kept deliberately small ── */}
        <Rise delay={0.4} className="mt-10">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            And once a word is yours
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {SUPPORTING.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card text-sm font-semibold text-foreground shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.2)]"
              >
                <span className="text-primary">{f.icon}</span>
                {f.label}
              </span>
            ))}
          </div>
        </Rise>

        <Rise delay={0.48} className="flex flex-col items-center mt-14">
          <GoogleButton />
        </Rise>

        {/* The app name in text a second time, where a reviewer checking
            branding expects to find it. */}
        <footer className="mt-16 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>
            <span className="font-display font-bold text-foreground">RomainTalk</span>
            {" — learn French by using it."}
          </p>
          <div className="flex items-center gap-4">
            <a href="https://romaintalk.com" className="hover:text-foreground transition-colors">
              romaintalk.com
            </a>
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Privacy Policy
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
