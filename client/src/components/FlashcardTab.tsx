import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { VocabEntry } from "@/types";
import { Star, Mic, MicOff, ChevronLeft, ChevronRight, Loader2, Trash2, Combine, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import ReviewLaunch, { ReviewLaunchChoice } from "@/components/ReviewLaunch";
import { motion, useReducedMotion } from "framer-motion";

/**
 * The launch screen's art: a card flipping between its two sides, which is
 * exactly what this tab does. The Quiz tab has its dog clip here; Flashcards
 * had nothing, which was most of why the screen read as empty.
 *
 * Built from two absolutely-positioned faces on a preserve-3d parent rather
 * than a video, so it costs nothing to load and picks up the palette.
 */
function FlipCardMotif() {
  const reduce = useReducedMotion();
  return (
    <div className="h-28 w-40 sm:h-32 sm:w-44" style={{ perspective: 800 }}>
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={reduce ? undefined : { rotateY: [0, 0, 180, 180, 360] }}
        transition={reduce ? undefined : { duration: 7, times: [0, 0.32, 0.5, 0.82, 1], repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          className="absolute inset-0 rounded-3xl bg-card flex flex-col items-center justify-center shadow-[0_10px_28px_-10px_rgb(23_63_107_/_0.45)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-accent-strong">FR</span>
          <span className="font-display text-xl font-bold text-foreground mt-1">bonjour</span>
        </div>
        <div
          className="absolute inset-0 rounded-3xl bg-primary flex flex-col items-center justify-center shadow-[0_10px_28px_-10px_rgb(23_63_107_/_0.45)]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/70">EN</span>
          <span className="font-display text-xl font-bold text-primary-foreground mt-1">hello</span>
        </div>
      </motion.div>
    </div>
  );
}

const SM2_STATUS_LABELS: Record<string, string> = { new: "New", learning: "Learning", review: "Review", mastered: "Mastered" };
const SM2_STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-800",
  learning: "bg-amber-500/20 text-amber-800",
  review: "bg-violet-500/20 text-violet-800",
  mastered: "bg-emerald-500/20 text-emerald-800",
};

// 3-button self-rating → SM-2 grade. Again=1, Good=3, Easy=5.
/**
 * `dir` is the direction the card flies off when graded, and the direction you
 * can drag it to grade by hand: Again left, Good up, Easy right. Left/right
 * follow the tinder-like convention of reject/accept; Good takes up because it
 * is the middle option and has no natural side.
 */
const GRADES = [
  { grade: 1 as const, key: "again" as const, label: "Again", dir: "left" as const, color: "bg-red-500/20 hover:bg-red-500/40 text-red-800 border-red-500/30" },
  { grade: 3 as const, key: "good" as const, label: "Good", dir: "up" as const, color: "bg-blue-500/20 hover:bg-blue-500/40 text-blue-800 border-blue-500/30" },
  { grade: 5 as const, key: "easy" as const, label: "Easy", dir: "right" as const, color: "bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-800 border-emerald-500/30" },
];

type SwipeDir = "left" | "up" | "right";

/**
 * Tooltip wrapper for the card-top icons.
 *
 * These were bare `title` attributes, which take a second or two to appear,
 * can't be styled, and never show on touch. A row of six unlabelled icons is
 * exactly where someone needs to know what they do without guessing.
 *
 * `asChild` keeps the trigger as the button itself rather than nesting one
 * inside another, which is invalid markup and swallows clicks.
 */
function IconHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Where a graded card flies to. Far enough to clear any viewport. */
const FLY = { left: { x: -700, y: 40, rotate: -18 }, right: { x: 700, y: 40, rotate: 18 }, up: { x: 0, y: -700, rotate: 0 } };

/** Drag distance past which releasing commits the grade. */
const SWIPE_THRESHOLD = 110;

/**
 * The example sentence on the back of a card.
 *
 * Fetched only once the answer is showing: pre-fetching every card in the deck
 * would fire a generation per word up front, and most sessions never reach the
 * end of the deck.
 */
function CardExample({ term, translation, visible }: { term: string; translation: string; visible: boolean }) {
  const { data, isLoading } = trpc.dictionary.example.useQuery(
    { term, translation },
    { enabled: visible, staleTime: Infinity, refetchOnWindowFocus: false }
  );

  if (!visible) return null;
  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> example…
      </div>
    );
  }
  if (!data?.fr) return null;

  return (
    <div className="mt-3 w-full max-w-sm rounded-xl bg-background/70 px-3.5 py-2.5 text-center">
      <p className="text-sm text-foreground leading-snug">{data.fr}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-snug">{data.en}</p>
    </div>
  );
}

interface SessionResult { total: number; again: number; good: number; easy: number; }
const ZERO: SessionResult = { total: 0, again: 0, good: 0, easy: 0 };

// In-progress flashcard session, kept at module scope so it survives tab
// switches (the tab unmounts when another tab is active).
interface SavedFlashcardSession {
  choice: ReviewLaunchChoice;
  deck: VocabEntry[];
  idx: number;
  flipped: boolean;
  sessionResult: SessionResult;
  sessionDone: boolean;
}
let savedFlashcardSession: SavedFlashcardSession | null = null;

export default function FlashcardTab({ reviewTarget }: { reviewTarget?: { dateKey: string } | null }) {
  const utils = trpc.useUtils();
  const { speak, preload, state: pronounceState, activeText } = usePronounce();
  // Refs so the autoplay effect can call the latest speak/preload without
  // depending on them (they change identity as pronounce state updates).
  const speakRef = useRef(speak);
  const preloadRef = useRef(preload);
  speakRef.current = speak;
  preloadRef.current = preload;

  // Restore an in-progress session on remount — unless we arrived via a
  // "Review these" CTA (reviewTarget), which always starts fresh for that date.
  const restore = !reviewTarget ? savedFlashcardSession : null;

  // null = show the launch screen; set = an active session.
  const [choice, setChoice] = useState<ReviewLaunchChoice | null>(restore?.choice ?? null);
  const [deck, setDeck] = useState<VocabEntry[]>(restore?.deck ?? []);
  const [idx, setIdx] = useState(restore?.idx ?? 0);
  const [flipped, setFlipped] = useState(restore?.flipped ?? false);
  /** Non-null while a graded card is flying off screen. */
  const [swipe, setSwipe] = useState<SwipeDir | null>(null);
  const reduceMotion = useReducedMotion();
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [sessionDone, setSessionDone] = useState(restore?.sessionDone ?? false);
  const [sessionResult, setSessionResult] = useState<SessionResult>(restore?.sessionResult ?? ZERO);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Inline edit state for the current card's French / English text.
  const [editing, setEditing] = useState(false);
  const [editTerm, setEditTerm] = useState("");
  const [editTranslation, setEditTranslation] = useState("");

  // Which side shows first: "fr" (French term) or "en" (English translation).
  const front: "fr" | "en" = choice?.front ?? "fr";

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Persist the live session so switching tabs and back resumes where you left off.
  useEffect(() => {
    if (choice && deck.length > 0 && !sessionDone) {
      savedFlashcardSession = { choice, deck, idx, flipped, sessionResult, sessionDone };
    } else if (!choice || sessionDone) {
      savedFlashcardSession = null;
    }
  }, [choice, deck, idx, flipped, sessionResult, sessionDone]);

  // Auto-play French audio when the French side becomes visible, and pre-warm
  // the next card's audio. With French-first that's on show; with English-first
  // it would give away the answer, so we wait until the card is flipped.
  // Keyed on card id (+ flip when English-first) so it doesn't replay needlessly.
  const currentCardId = deck[idx]?.id;
  useEffect(() => {
    const cur = deck[idx];
    if (!cur || sessionDone || editing) return;
    const frenchVisible = front === "fr" ? !flipped : flipped;
    if (frenchVisible) speakRef.current(cur.term);
    const next = deck[idx + 1];
    if (next) preloadRef.current(next.term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCardId, sessionDone, flipped, front]);

  // Close the edit panel whenever the displayed card changes.
  useEffect(() => { setEditing(false); }, [currentCardId]);

  // Launch a session: fetch the chosen queue, then build the deck. Fetching
  // imperatively (vs a reactive query) keeps a restored deck from being clobbered.
  const startSession = async (c: ReviewLaunchChoice) => {
    setStarting(true);
    try {
      // Only the queue fields go to the server; `front` is a display choice.
      const words = (await utils.review.getQueue.fetch({ mode: c.mode, dateKey: c.dateKey, limit: c.limit })) as VocabEntry[];
      setChoice(c);
      setDeck([...words]);
      setIdx(0);
      setFlipped(false);
      setSessionDone(false);
      setSessionResult(ZERO);
      setTranscription(null);
    } catch {
      toast.error("Couldn't load words to review");
    } finally {
      setStarting(false);
    }
  };

  const submitReviewMutation = trpc.review.submitReview.useMutation({
    onSuccess: () => {
      utils.review.getStats.invalidate();
      utils.review.getDates.invalidate();
      utils.vocab.list.invalidate();
    },
  });

  const deleteMutation = trpc.vocab.delete.useMutation({
    // Filter by the deleted id from the mutation's own variables, not
    // confirmDeleteId — that state is cleared before onSuccess runs. Removing
    // the current card shifts the next one into the same index, so the deck
    // naturally advances to the following card.
    onSuccess: (_d, vars) => {
      setDeck((d) => {
        const next = d.filter((w) => w.id !== vars.id);
        setIdx((i) => Math.min(i, Math.max(0, next.length - 1)));
        return next;
      });
      setFlipped(false);
      setTranscription(null);
      setConfirmDeleteId(null);
      toast.success("Word removed from library");
    },
    onError: () => toast.error("Failed to delete"),
    onSettled: () => { utils.vocab.list.invalidate(); utils.review.getDates.invalidate(); },
  });

  const starMutation = trpc.vocab.toggleStar.useMutation({
    onMutate: ({ id }) => setDeck((d) => d.map((w) => (w.id === id ? { ...w, starred: !w.starred } : w))),
    onSettled: () => utils.vocab.list.invalidate(),
  });

  // Merge the current card into the previous one (rejoin a split sentence).
  const mergeMutation = trpc.vocab.mergeIntoPrevious.useMutation({
    onSuccess: (merged) => {
      setDeck((d) => {
        const next = [...d];
        const prevIdx = idx - 1;
        if (prevIdx < 0) return d;
        next[prevIdx] = { ...next[prevIdx], term: merged.term, translation: merged.translation, entryKind: "phrase" };
        next.splice(idx, 1); // remove the now-merged current card
        return next;
      });
      setIdx((i) => Math.max(0, i - 1));
      setFlipped(false);
      setTranscription(null);
      toast.success("Merged with previous card");
      utils.vocab.list.invalidate();
      utils.review.getDates.invalidate();
      utils.review.getStats.invalidate();
    },
    onError: () => toast.error("Failed to merge"),
  });

  const handleMergeWithPrevious = () => {
    if (idx < 1 || mergeMutation.isPending) return;
    mergeMutation.mutate({ currentId: deck[idx].id, previousId: deck[idx - 1].id });
  };

  // Inline edit of the current card's French term / English translation.
  const updateMutation = trpc.vocab.update.useMutation({
    onSuccess: (_d, vars) => {
      setDeck((dk) => dk.map((w) => (w.id === vars.id
        ? { ...w, term: vars.term ?? w.term, translation: vars.translation ?? w.translation }
        : w)));
      setEditing(false);
      toast.success("Card updated");
      utils.vocab.list.invalidate();
    },
    onError: () => toast.error("Failed to save changes"),
  });

  const startEdit = () => {
    if (!deck[idx]) return;
    setEditTerm(deck[idx].term);
    setEditTranslation(deck[idx].translation);
    setEditing(true);
  };

  const saveEdit = () => {
    const cur = deck[idx];
    if (!cur) return;
    const term = editTerm.trim();
    const translation = editTranslation.trim();
    if (!term || !translation) { toast.error("Both fields are required"); return; }
    if (term === cur.term && translation === cur.translation) { setEditing(false); return; }
    updateMutation.mutate({ id: cur.id, term, translation });
  };

  const transcribeMutation = trpc.voice.transcribe.useMutation({
    onSuccess: (data) => { setTranscription(data.transcription); setTranscribing(false); },
    onError: () => { toast.error("Transcription failed"); setTranscribing(false); },
  });
  const storagePutMutation = trpc.storage.uploadAudio.useMutation();

  const currentWord = deck[idx];

  const advance = useCallback(() => {
    setTranscription(null);
    setConfirmDeleteId(null);
    if (idx < deck.length - 1) {
      setIdx((i) => i + 1);
      setFlipped(false);
    } else {
      setSessionDone(true);
    }
  }, [idx, deck.length]);

  const applyGrade = useCallback((grade: 1 | 3 | 5) => {
    if (!currentWord) return;
    submitReviewMutation.mutate({ vocabId: currentWord.id, grade });
    const key = grade === 1 ? "again" : grade === 3 ? "good" : "easy";
    setSessionResult((prev) => ({ ...prev, total: prev.total + 1, [key]: (prev[key as keyof SessionResult] as number) + 1 }));

    // "Again" → requeue to the end of the deck for another pass this session.
    if (grade === 1) {
      setDeck((d) => {
        const next = [...d];
        const card = next.splice(idx, 1)[0];
        next.push(card);
        return next;
      });
      setFlipped(false);
      setTranscription(null);
      setConfirmDeleteId(null);
      return;
    }
    advance();
  }, [currentWord, idx, submitReviewMutation, advance]);

  const handleGrade = useCallback((grade: 1 | 3 | 5) => {
    if (!currentWord) return;
    // Fly the card out in the grade's direction, then apply. The delay is the
    // animation's own length — grading immediately would swap the content
    // underneath a card that is still on screen.
    const dir = GRADES.find((g) => g.grade === grade)?.dir ?? "up";
    setSwipe(dir);
    window.setTimeout(() => {
      setSwipe(null);
      applyGrade(grade);
    }, 260);
  }, [currentWord, applyGrade]);

  // Keyboard shortcuts to rate faster: 1 = Again, 2 = Good, 3 = Easy.
  // Space flips the card (same as tapping it).
  // Maps by GRADES index so the keys stay in sync if the grades change.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || sessionDone || !currentWord) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " ") {
        // preventDefault also stops space from scrolling or re-triggering a focused button
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      const gradeIdx = { "1": 0, "2": 1, "3": 2 }[e.key];
      if (gradeIdx === undefined) return;
      e.preventDefault();
      handleGrade(GRADES[gradeIdx].grade);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, sessionDone, currentWord, handleGrade]);

  const handlePrev = () => { setIdx((i) => Math.max(0, i - 1)); setFlipped(false); setTranscription(null); setConfirmDeleteId(null); };
  const handleNext = () => { if (idx < deck.length - 1) { setIdx((i) => i + 1); setFlipped(false); setTranscription(null); setConfirmDeleteId(null); } };

  const handleDeleteCurrent = () => {
    if (!currentWord) return;
    if (confirmDeleteId === currentWord.id) { deleteMutation.mutate({ id: currentWord.id }); setConfirmDeleteId(null); }
    else setConfirmDeleteId(currentWord.id);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await uploadAndTranscribe(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch { toast.error("Microphone access denied"); }
  };
  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecording(false); };
  const uploadAndTranscribe = async (blob: Blob) => {
    if (!deck[idx]) return;
    setTranscribing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(Array.from(new Uint8Array(arrayBuffer)).map((b) => String.fromCharCode(b)).join(""));
      const result = await storagePutMutation.mutateAsync({ base64, mimeType: "audio/webm" });
      transcribeMutation.mutate({ audioUrl: result.url, targetTerm: deck[idx].term });
    } catch { toast.error("Upload failed"); setTranscribing(false); }
  };

  // ── Launch screen ──────────────────────────────────────────────────────────
  if (!choice) {
    return (
      <div className="flex flex-col h-full">
        {starting ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <ReviewLaunch
            key={reviewTarget?.dateKey ?? "none"}
            kind="flashcards"
            initialDateKey={reviewTarget?.dateKey}
            onStart={startSession}
            header={<FlipCardMotif />}
          />
        )}
      </div>
    );
  }

  // ── Session complete ─────────────────────────────────────────────────────
  if (sessionDone) {
    const pct = sessionResult.total > 0 ? Math.round(((sessionResult.good + sessionResult.easy) / sessionResult.total) * 100) : 0;
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
        <p className="text-5xl">{pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "💪"}</p>
        <p className="text-2xl font-bold text-foreground">Session Complete!</p>
        <p className="text-sm text-muted-foreground">{sessionResult.total} cards reviewed</p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {GRADES.map(({ label, key, color }) => (
            <div key={key} className={cn("px-4 py-2 rounded-xl text-xs font-semibold text-center", color)}>
              <div className="text-lg font-bold">{sessionResult[key as keyof SessionResult]}</div>
              <div>{label}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setChoice(null); }}
          className="mt-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
        >
          New session
        </button>
      </div>
    );
  }

  if (!currentWord) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
        <p className="text-5xl">🎉</p>
        <p className="text-xl font-semibold text-foreground">Nothing to review here.</p>
        <button onClick={() => setChoice(null)} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold">
          Pick something else
        </button>
      </div>
    );
  }

  const matchScore = transcription
    ? (() => {
        const t = transcription.toLowerCase().trim();
        const target = currentWord.term.toLowerCase().trim();
        if (t === target) return 1;
        if (t.includes(target) || target.includes(t)) return 0.8;
        const tWords = t.split(/\s+/);
        const targetWords = target.split(/\s+/);
        return targetWords.filter((w) => tWords.some((tw) => tw.includes(w) || w.includes(tw))).length / targetWords.length;
      })()
    : null;

  const sm2Status = (currentWord as any).sm2Status as string | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: change session + progress */}
      <div className="flex-shrink-0 h-14 border-b border-border bg-background/80 backdrop-blur-sm px-4 flex items-center gap-2">
        <button onClick={() => setChoice(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Change
        </button>
        <span className="ml-auto text-xs text-muted-foreground font-medium">{idx + 1} / {deck.length}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md space-y-4">
          {/* Progress bar */}
          <div className="h-1 bg-muted rounded-full">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((idx + 1) / deck.length) * 100}%` }} />
          </div>

          {/* Card-top controls: edit, merge, star, pronounce, record, delete */}
          <TooltipProvider delayDuration={150}>
          <div className="flex items-center justify-center gap-2">
            <IconHint label="Edit this card's French or English">
              <button
                onClick={startEdit}
                aria-label="Edit this card"
                className="p-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
              >
                <Pencil className="w-4.5 h-4.5" />
              </button>
            </IconHint>
            <IconHint label={idx < 1 ? "Merge into the previous card — needs a card before this one" : "Merge into the previous card (rejoins a split sentence)"}>
              {/* A disabled button fires no pointer events, so the hint would
                  never show on the one card where it needs explaining. The span
                  takes the hover instead. */}
              <span className="inline-flex">
                <button
                  onClick={handleMergeWithPrevious}
                  disabled={idx < 1 || mergeMutation.isPending}
                  aria-label="Merge into the previous card"
                  className="p-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  {mergeMutation.isPending ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Combine className="w-4.5 h-4.5" />}
                </button>
              </span>
            </IconHint>
            <IconHint label={currentWord.starred ? "Starred — click to unstar" : "Star this word to find it quickly later"}>
              <button
                onClick={() => starMutation.mutate({ id: currentWord.id })}
                aria-label={currentWord.starred ? "Unstar this word" : "Star this word"}
                className={cn("p-2.5 rounded-xl border transition-colors", currentWord.starred ? "bg-star/20 border-star/50 text-star" : "bg-card border-border text-muted-foreground hover:text-star hover:border-star/50")}
              >
                <Star className={cn("w-4.5 h-4.5", currentWord.starred && "fill-current")} />
              </button>
            </IconHint>
            <IconHint label="Hear it pronounced">
              <span className="inline-flex">
                <PronounceButton
                  text={currentWord.term}
                  speak={speak}
                  state={pronounceState}
                  activeText={activeText}
                  className="p-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50"
                  iconSize="w-4.5 h-4.5"
                />
              </span>
            </IconHint>
            <IconHint label="Hold to record yourself, release to compare">
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                aria-label="Hold to record your pronunciation"
                className={cn("p-2.5 rounded-xl border transition-all", recording ? "bg-red-500/20 border-red-500 text-red-700 scale-110 animate-pulse" : "bg-card border-border text-muted-foreground hover:text-primary hover:border-primary/50")}
              >
                {recording ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
              </button>
            </IconHint>
            {confirmDeleteId === currentWord.id ? (
              <div className="flex items-center gap-1">
                <button onClick={handleDeleteCurrent} className="px-3 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/80 transition-colors">Delete</button>
                <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80 transition-colors">Cancel</button>
              </div>
            ) : (
              <IconHint label="Delete this word from your library">
                <button
                  onClick={handleDeleteCurrent}
                  aria-label="Delete this word"
                  className="p-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              </IconHint>
            )}
          </div>
          </TooltipProvider>

          {/* Edit panel (replaces the card while editing) */}
          {editing ? (
            <div className="w-full rounded-2xl border border-primary/30 bg-card p-4 space-y-3" style={{ minHeight: "220px" }}>
              <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">Edit card</p>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">French</label>
                <input
                  value={editTerm}
                  onChange={(e) => setEditTerm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">English</label>
                <input
                  value={editTranslation}
                  onChange={(e) => setEditTranslation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={updateMutation.isPending} className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50">
                  {updateMutation.isPending ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
          /* Flip card — front side depends on the chosen "show first" language */
          <motion.div
            className="w-full"
            style={{ height: "260px", touchAction: "pan-y" }}
            // Drag to grade by hand, in the same directions the buttons fly:
            // left = Again, up = Good, right = Easy.
            drag={reduceMotion ? false : true}
            dragSnapToOrigin
            dragElastic={0.5}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            onDragEnd={(_, info) => {
              const { x, y } = info.offset;
              if (y < -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) handleGrade(3);
              else if (x < -SWIPE_THRESHOLD) handleGrade(1);
              else if (x > SWIPE_THRESHOLD) handleGrade(5);
            }}
            animate={swipe ? FLY[swipe] : { x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={{ duration: swipe ? 0.26 : 0.2, ease: "easeOut" }}
          >
          <div className="flip-card w-full h-full" onClick={() => setFlipped((f) => !f)}>
            <div className={cn("flip-card-inner w-full h-full", flipped && "flipped")}>
              <div className="flip-card-front absolute inset-0 bg-gradient-to-br from-card to-muted/30 rounded-2xl flex flex-col items-center justify-center p-6 cursor-grab active:cursor-grabbing shadow-lg">
                {sm2Status && (
                  <span className={cn("absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded-full font-semibold", SM2_STATUS_COLORS[sm2Status] ?? "bg-muted text-muted-foreground")}>
                    {SM2_STATUS_LABELS[sm2Status] ?? sm2Status}
                  </span>
                )}
                <p className="text-2xl font-bold text-foreground text-center">{front === "fr" ? currentWord.term : currentWord.translation}</p>
                <p className="text-xs text-muted-foreground mt-2">Tap or press <kbd className="font-mono border border-current rounded px-1 leading-tight">space</kbd> to reveal</p>
              </div>
              <div className="flip-card-back absolute inset-0 bg-gradient-to-br from-primary/10 to-card border border-primary/30 rounded-2xl flex flex-col items-center justify-center p-5 cursor-grab active:cursor-grabbing shadow-lg">
                <p className="text-2xl font-bold text-foreground text-center">{front === "fr" ? currentWord.translation : currentWord.term}</p>
                {/* Always keyed on the French side, whichever face it is on, so
                    the sentence demonstrates the French rather than the gloss. */}
                <CardExample
                  term={currentWord.term}
                  translation={currentWord.translation}
                  visible={flipped}
                />
              </div>
            </div>
          </div>
          </motion.div>
          )}

          {/* Nav arrows flanking the 3 grade buttons (hidden while editing) */}
          {!editing && (
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.currentTarget.blur(); handlePrev(); }} disabled={idx === 0} className="p-3 rounded-xl bg-card border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* 3 grade buttons — always visible, rate from recall before or after flip */}
            <div className="flex-1 flex gap-1.5">
              {GRADES.map(({ grade, label, color }, i) => (
                // blur() so the button doesn't keep focus after a click —
                // a focused grade button re-fires on Enter/Space presses meant
                // for shortcuts (e.g. the Shift+Return voice chord).
                <button key={grade} onClick={(e) => { e.currentTarget.blur(); handleGrade(grade); }} className={cn("flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5", color)}>
                  {label}
                  <kbd className="text-[10px] font-mono opacity-60 border border-current rounded px-1 leading-tight">{i + 1}</kbd>
                </button>
              ))}
            </div>

            <button onClick={(e) => { e.currentTarget.blur(); handleNext(); }} disabled={idx === deck.length - 1} className="p-3 rounded-xl bg-card border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          )}

          {/* Pronunciation feedback */}
          {recording && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
              <p className="text-sm text-red-800 font-semibold animate-pulse">🎙 Recording… release to stop</p>
            </div>
          )}
          {transcribing && (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p className="text-sm text-primary">Transcribing your pronunciation…</p>
            </div>
          )}
          {transcription && !transcribing && (
            <div className={cn("rounded-xl p-4 border", matchScore !== null && matchScore >= 0.8 ? "bg-emerald-500/10 border-emerald-300" : "bg-amber-500/10 border-amber-300")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">You said:</p>
                  <p className="text-sm font-semibold text-foreground">"{transcription}"</p>
                </div>
                {matchScore !== null && (
                  <span className={cn("text-xs px-2 py-1 rounded-full font-bold flex-shrink-0", matchScore >= 0.8 ? "bg-emerald-500/20 text-emerald-800" : "bg-amber-500/20 text-amber-800")}>
                    {matchScore >= 0.8 ? "✓ Good!" : "Try again"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
