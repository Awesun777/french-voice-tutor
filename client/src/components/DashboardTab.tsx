/**
 * DashboardTab — the landing page.
 *
 * Two ways in, deliberately only two: talk to someone, or get on with the
 * things you'd be doing in English anyway. Everything else in the app is a
 * detail of one of those, and the sidebar is there when you want it.
 *
 * The mascot is not decoration: it tracks the pointer, and clicking it speaks a
 * French phrase through the same TTS the rest of the app uses, so the first
 * thing on the page is already French coming out loud.
 */
import { useState, useRef, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { SidebarTab } from "@/types";
import { AvatarVideo } from "@/components/AvatarVideo";
import { usePronounce } from "@/lib/pronounce";
import {
  Mic, Newspaper, Youtube, ArrowRight, Volume2, BookMarked, Brain, CreditCard,
  Search, MessageCircle, Headphones,
} from "lucide-react";

/** What the mascot says when you poke it. Short, spoken, and actually useful. */
const MASCOT_LINES = [
  { fr: "Bonjour !", en: "Hello!" },
  { fr: "Ça va ?", en: "How's it going?" },
  { fr: "On y va !", en: "Let's go!" },
  { fr: "À toi de parler.", en: "Your turn to speak." },
  { fr: "Bien joué !", en: "Well done!" },
  { fr: "Encore un mot ?", en: "One more word?" },
];

// ─── Mascot ───────────────────────────────────────────────────────────────────

function Mascot() {
  const reduce = useReducedMotion();
  const { speak } = usePronounce();
  const [line, setLine] = useState<(typeof MASCOT_LINES)[number] | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const nextIdx = useRef(0);
  const hideTimer = useRef<number | null>(null);

  // Lean toward the pointer. Small numbers on purpose — it should read as the
  // figure noticing you, not as a toy spinning.
  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (reduce) return;
      const r = e.currentTarget.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      setTilt({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
    },
    [reduce]
  );

  const say = () => {
    const next = MASCOT_LINES[nextIdx.current % MASCOT_LINES.length];
    nextIdx.current += 1;
    setLine(next);
    speak(next.fr);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setLine(null), 4000);
  };

  return (
    <div className="relative flex-shrink-0">
      {/* Speech bubble. Anchored above-right so it never covers the figure. */}
      {line && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          className="absolute -top-3 left-full ml-2 z-10 w-max max-w-[12rem] rounded-2xl bg-popover px-3.5 py-2.5 shadow-[0_12px_30px_-10px_rgb(23_63_107_/_0.4)] ring-1 ring-black/5"
        >
          <p className="font-display text-sm font-bold text-foreground whitespace-nowrap">{line.fr}</p>
          <p className="text-xs text-muted-foreground whitespace-nowrap">{line.en}</p>
        </motion.div>
      )}

      <motion.button
        onMouseMove={onMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
        onClick={say}
        aria-label="Hear a French phrase from the RomainTalk mascot"
        className="relative block rounded-3xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        animate={
          reduce
            ? undefined
            : { y: [0, -6, 0], rotate: tilt.x * 6, scale: 1 }
        }
        transition={{
          y: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
          rotate: { type: "spring", stiffness: 200, damping: 18 },
        }}
        whileHover={reduce ? undefined : { scale: 1.05 }}
        whileTap={reduce ? undefined : { scale: 0.95 }}
      >
        <div aria-hidden className="absolute inset-0 -m-4 rounded-full bg-accent/25 blur-2xl" />
        <img
          src="/brand/romaintalk-icon.png"
          alt=""
          className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl shadow-[0_14px_34px_-14px_rgb(23_63_107_/_0.55)]"
        />
        {/* Affordance: without this it reads as a logo, not something to press. */}
        <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
          <Volume2 className="w-3.5 h-3.5" />
        </span>
      </motion.button>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function Panel({
  children,
  className,
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  delay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative overflow-hidden rounded-3xl p-6 sm:p-7 flex flex-col", className)}
    >
      {children}
    </motion.div>
  );
}

export default function DashboardTab({
  setActiveTab,
}: {
  setActiveTab: (tab: SidebarTab) => void;
}) {
  const reduce = useReducedMotion();
  const { data: videos = [] } = trpc.videos.list.useQuery();
  const { data: articles = [] } = trpc.articles.list.useQuery();

  return (
    <div className="relative flex-1 overflow-y-auto">
      {/* Same drifting fields as the review launch screen, so the two entry
          points to the app feel like the same product. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute w-[30rem] h-[30rem] -top-40 -left-28 rounded-full bg-accent/25 blur-3xl"
          animate={reduce ? undefined : { x: [0, 40, -20, 0], y: [0, 30, 50, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[26rem] h-[26rem] -bottom-32 -right-24 rounded-full bg-speaking/15 blur-3xl"
          animate={reduce ? undefined : { x: [0, -35, 15, 0], y: [0, -25, -45, 0] }}
          transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
        {/* Greeting + mascot */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-6 sm:gap-10"
        >
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              RomainTalk
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground leading-tight mt-1.5">
              How do you want to learn today?
            </h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              Two ways in: open your mouth, or just carry on with your day — in French.
            </p>
          </div>
          <div className="ml-auto hidden sm:block">
            <Mascot />
          </div>
        </motion.div>

        {/* The mascot needs somewhere to go on narrow screens, where the header
            row has no room beside the copy. */}
        <div className="sm:hidden mt-6 flex justify-center">
          <Mascot />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8 sm:mt-10">
          {/* ── Left: speaking ── */}
          <Panel
            delay={0.08}
            className="bg-primary text-primary-foreground shadow-[0_18px_44px_-18px_rgb(23_63_107_/_0.8)]"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">
              <Mic className="w-3.5 h-3.5" /> Speaking
            </div>
            <h2 className="font-display text-2xl font-bold mt-2">Learn by Speaking</h2>
            <p className="text-sm text-primary-foreground/80 mt-2 leading-relaxed">
              Have a real conversation with Romain or Anna. They talk back, correct you gently,
              and you can save any word straight to your library.
            </p>

            {/* The tutors, so the card shows who you'd actually be talking to. */}
            <div className="flex items-center gap-3 mt-6">
              {[
                { src: "/avatars/romain.mp4", name: "Romain" },
                { src: "/avatars/anna.mp4", name: "Anna" },
              ].map((a) => (
                <div key={a.name} className="flex items-center gap-2.5">
                  <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/25 flex-shrink-0">
                    <AvatarVideo src={a.src} />
                  </div>
                  <span className="text-sm font-semibold">{a.name}</span>
                </div>
              ))}
            </div>

            <motion.button
              onClick={() => setActiveTab("voice-chat")}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className="group mt-auto pt-7 w-full"
            >
              <span className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white text-primary font-bold shadow-[0_10px_24px_-10px_rgb(0_0_0_/_0.5)] transition-shadow group-hover:shadow-[0_16px_32px_-12px_rgb(0_0_0_/_0.6)]">
                Start talking
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </span>
            </motion.button>
          </Panel>

          {/* ── Right: doing ── */}
          <Panel delay={0.16} className="bg-card shadow-[0_10px_30px_-14px_rgb(23_63_107_/_0.45)]">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-speaking">
              <Newspaper className="w-3.5 h-3.5" /> Everyday
            </div>
            <h2 className="font-display text-2xl font-bold text-foreground mt-2">Learn by Doing</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Watch the videos and read the news you'd be scrolling through anyway — except it's in
              French, and every word is one hover away from its meaning.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
              {[
                {
                  tab: "listening" as const,
                  icon: <Youtube className="w-5 h-5" />,
                  label: "Watch",
                  sub: `${videos.length} video${videos.length === 1 ? "" : "s"}`,
                  tone: "bg-speaking-surface text-speaking",
                },
                {
                  tab: "reading" as const,
                  icon: <Newspaper className="w-5 h-5" />,
                  label: "Read",
                  sub: `${articles.length} article${articles.length === 1 ? "" : "s"}`,
                  tone: "bg-secondary text-primary",
                },
              ].map((o) => (
                <motion.button
                  key={o.tab}
                  onClick={() => setActiveTab(o.tab)}
                  whileHover={reduce ? undefined : { y: -3 }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  className="group text-left rounded-2xl bg-background p-4 shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.2)] hover:shadow-[0_12px_26px_-10px_rgb(23_63_107_/_0.35)] transition-shadow"
                >
                  <span className={cn("inline-flex w-10 h-10 rounded-xl items-center justify-center", o.tone)}>
                    {o.icon}
                  </span>
                  <p className="font-display text-base font-bold text-foreground mt-3 flex items-center gap-1.5">
                    {o.label}
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.sub}</p>
                </motion.button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground/80 mt-auto pt-6">
              Both live under <span className="font-semibold text-foreground">Test Prep</span> in the
              sidebar, alongside the grammar test.
            </p>
          </Panel>
        </div>

        <HowItWorks setActiveTab={setActiveTab} />
        <Shortcuts />
      </div>
    </div>
  );
}

// ─── Walkthrough ──────────────────────────────────────────────────────────────

/**
 * The one thing that isn't obvious from the two panels above: speaking,
 * listening and reading are three doors into the same loop, and the loop is
 * vocabulary. Laid out as numbered steps because the order is the point.
 */
function HowItWorks({ setActiveTab }: { setActiveTab: (tab: SidebarTab) => void }) {
  const reduce = useReducedMotion();

  const steps = [
    {
      n: 1,
      title: "Meet words in the wild",
      body: "Talking to Romain or Anna, following a video transcript, or reading an article. Real context, not a word list.",
      icons: [<Mic key="m" className="w-3.5 h-3.5" />, <Headphones key="h" className="w-3.5 h-3.5" />, <Newspaper key="n" className="w-3.5 h-3.5" />],
      tone: "bg-speaking-surface text-speaking",
    },
    {
      n: 2,
      title: "Save the ones you didn't know",
      body: "Hover any underlined word for its meaning and hit save. Everything lands in My Library, tagged with where you found it.",
      icons: [<BookMarked key="b" className="w-3.5 h-3.5" />],
      tone: "bg-secondary text-primary",
      tab: "library" as const,
    },
    {
      n: 3,
      title: "Let them come back to you",
      body: "Spaced repetition schedules each word. Quiz tests recall, Flashcards drill recognition, and both pull from the same Due Today queue.",
      icons: [<Brain key="q" className="w-3.5 h-3.5" />, <CreditCard key="f" className="w-3.5 h-3.5" />],
      tone: "bg-secondary text-primary",
      tab: "quiz" as const,
    },
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="mt-10"
    >
      <h2 className="font-display text-lg font-bold text-foreground">How it fits together</h2>
      <p className="text-sm text-muted-foreground mt-1">
        However you meet a word, it ends up in the same place — and comes back until you know it.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        {steps.map((s) => (
          <div
            key={s.n}
            className="relative rounded-2xl bg-card p-5 shadow-[0_2px_12px_-4px_rgb(23_63_107_/_0.18)]"
          >
            <div className="flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg", s.tone)}>
                {s.icons}
              </span>
              <span className="font-display text-xs font-bold text-muted-foreground">STEP {s.n}</span>
            </div>
            <p className="font-display text-base font-bold text-foreground mt-3">{s.title}</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{s.body}</p>
            {s.tab && (
              <button
                onClick={() => setActiveTab(s.tab)}
                className="group mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                Open
                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.section>
  );
}

/**
 * Neither shortcut is discoverable — one is a punctuation key, the other is a
 * chord most apps use for "new line" — so the dashboard is the only place a
 * user would find out they exist.
 */
function Shortcuts() {
  const reduce = useReducedMotion();

  const items = [
    {
      keys: ["Shift", "\\"],
      icon: <Search className="w-4 h-4" />,
      title: "Look up any word",
      body: "Opens the dictionary from anywhere. Highlight a word first and it arrives already filled in.",
      tone: "bg-secondary text-primary",
    },
    {
      keys: ["Shift", "Return"],
      icon: <MessageCircle className="w-4 h-4" />,
      title: "Ask your tutor out loud",
      body: "Starts recording immediately. Highlight a phrase first and just ask “what does it mean?” — the tutor answers in writing.",
      tone: "bg-speaking-surface text-speaking",
    },
  ];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mt-10 mb-4"
    >
      <h2 className="font-display text-lg font-bold text-foreground">Two shortcuts worth knowing</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Both work on every page, and both stay out of the way while you're typing.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        {items.map((s) => (
          <div key={s.title} className="rounded-2xl bg-card p-5 shadow-[0_2px_12px_-4px_rgb(23_63_107_/_0.18)]">
            <div className="flex items-center gap-3">
              <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", s.tone)}>
                {s.icon}
              </span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                    <kbd className="px-2 py-1 rounded-md bg-muted/70 text-xs font-mono font-bold text-foreground">
                      {k}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
            <p className="font-display text-base font-bold text-foreground mt-3">{s.title}</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
