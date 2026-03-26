import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VocabEntry } from "@/types";
import { Volume2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function pronounce(text: string) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR"; u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }

function isDue(w: VocabEntry) {
  if (w.starred) return true;
  const seen = w.quizCount ?? 0;
  if (seen === 0) return true;
  const last = w.lastQuizzed ? new Date(w.lastQuizzed) : new Date(0);
  const days = (Date.now() - last.getTime()) / 86400000;
  return seen === 1 ? days >= 1 : days >= 3;
}

const MIN_BUCKET = 4;
const PREFERRED_BUCKET = 20;

function buildBuckets(words: VocabEntry[]) {
  if (!words.length) return [];
  const byDay: Record<string, VocabEntry[]> = {};
  words.forEach((w) => { const k = w.dateKey ?? "unknown"; if (!byDay[k]) byDay[k] = []; byDay[k].push(w); });
  const sortedDays = Object.keys(byDay).sort();
  const raw: { words: VocabEntry[]; start: string; end: string }[] = [];
  let current: { words: VocabEntry[]; start: string; end: string } | null = null;
  for (const day of sortedDays) {
    if (!current) { current = { words: [...byDay[day]], start: day, end: day }; }
    else if (current.words.length >= PREFERRED_BUCKET) { raw.push(current); current = { words: [...byDay[day]], start: day, end: day }; }
    else { current.words.push(...byDay[day]); current.end = day; }
  }
  if (current) raw.push(current);
  const buckets: { words: VocabEntry[]; start: string; end: string }[] = [];
  for (const b of raw) {
    if (b.words.length < MIN_BUCKET && buckets.length > 0) { const prev = buckets[buckets.length - 1]; prev.words.push(...b.words); prev.end = b.end; }
    else buckets.push(b);
  }
  return buckets;
}

function fmtRange(start: string, end: string) {
  if (start === end) {
    const d = new Date(start + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const s = new Date(start + "T12:00:00"), e = new Date(end + "T12:00:00");
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

interface QuizQuestion {
  word: VocabEntry;
  choices?: { display: string; isCorrect: boolean }[];
  isPhrase: boolean;
}

function buildChoices(word: VocabEntry, allWords: VocabEntry[], direction: "fr2en" | "en2fr") {
  const others = shuffle(allWords.filter((w) => w.id !== word.id && w.translation));
  const wrongs = others.slice(0, 3);
  if (direction === "en2fr") {
    return shuffle([
      { display: word.term, isCorrect: true },
      ...wrongs.map((w) => ({ display: w.term, isCorrect: false })),
    ]);
  }
  return shuffle([
    { display: word.translation, isCorrect: true },
    ...wrongs.map((w) => ({ display: w.translation, isCorrect: false })),
  ]);
}

export default function QuizTab() {
  const { data: words = [] } = trpc.vocab.list.useQuery();
  const [phase, setPhase] = useState<"select" | "quiz" | "done">("select");
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [direction, setDirection] = useState<"fr2en" | "en2fr">("fr2en");
  const [dueOnly, setDueOnly] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [fillInput, setFillInput] = useState("");
  const [fillResult, setFillResult] = useState<{ correct: boolean; note: string } | null>(null);
  const [fillGrading, setFillGrading] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState<{ word: VocabEntry; chosenDisplay: string }[]>([]);
  const fillRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const gradeMutation = trpc.quiz.gradeAnswer.useMutation();
  const saveSessionMutation = trpc.quiz.saveSession.useMutation();
  const updateProgressMutation = trpc.vocab.updateQuizProgress.useMutation();
  const starMutation = trpc.vocab.toggleStar.useMutation({
    onSettled: () => utils.vocab.list.invalidate(),
  });

  const buckets = buildBuckets(words.filter((w) => w.translation));
  const quizableWords = selectedBucket !== null
    ? (dueOnly ? buckets[selectedBucket]?.words.filter(isDue) : buckets[selectedBucket]?.words) ?? []
    : (dueOnly ? words.filter((w) => w.translation && isDue(w)) : words.filter((w) => w.translation));

  const startQuiz = () => {
    if (quizableWords.length < 2) { toast.error("Need at least 2 words to start a quiz"); return; }
    const pool = shuffle(quizableWords).slice(0, 20);
    const qs: QuizQuestion[] = pool.map((word) => ({
      word,
      isPhrase: word.entryKind === "phrase",
      choices: (word.entryKind !== "phrase" && direction === "fr2en")
        ? buildChoices(word, quizableWords, direction)
        : undefined,
    }));
    setQuestions(qs);
    setQIndex(0);
    setScore(0);
    setSelected(null);
    setFillInput("");
    setFillResult(null);
    setWrongAnswers([]);
    setPhase("quiz");
  };

  const handleSelect = (choice: { display: string; isCorrect: boolean }) => {
    if (selected) return;
    setSelected(choice.display);
    if (choice.isCorrect) {
      setScore((s) => s + 1);
    } else {
      setWrongAnswers((wa) => [...wa, { word: questions[qIndex].word, chosenDisplay: choice.display }]);
    }
    setTimeout(() => nextQuestion(), 900);
  };

  const handleFillSubmit = async () => {
    if (fillResult) { nextQuestion(); return; }
    if (!fillInput.trim() || fillGrading) return;
    setFillGrading(true);
    const q = questions[qIndex];
    try {
      const result = await gradeMutation.mutateAsync({
        userAnswer: fillInput.trim(),
        correctAnswer: q.word.term,
        term: q.word.term,
      });
      setFillResult(result);
      if (result.correct) setScore((s) => s + 1);
      else setWrongAnswers((wa) => [...wa, { word: q.word, chosenDisplay: fillInput.trim() }]);
    } catch {
      toast.error("Grading failed");
    }
    setFillGrading(false);
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= questions.length) {
      finishQuiz();
    } else {
      setQIndex((i) => i + 1);
      setSelected(null);
      setFillInput("");
      setFillResult(null);
      setTimeout(() => fillRef.current?.focus(), 100);
    }
  };

  const finishQuiz = () => {
    setPhase("done");
    const bucket = selectedBucket !== null ? buckets[selectedBucket] : null;
    saveSessionMutation.mutate({
      score,
      total: questions.length,
      direction,
      bucketStart: bucket?.start,
      bucketEnd: bucket?.end,
    });
    // Update spaced repetition
    const now = new Date();
    updateProgressMutation.mutate(
      questions.map((q) => ({
        id: q.word.id,
        quizCount: (q.word.quizCount ?? 0) + 1,
        lastQuizzed: now,
      }))
    );
  };

  if (!words.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-5xl mb-4">🧠</p>
        <p className="text-xl font-semibold text-foreground mb-2">No words yet!</p>
        <p className="text-sm text-muted-foreground">Add words to your library first.</p>
      </div>
    );
  }

  if (phase === "done") {
    const pct = questions.length ? score / questions.length : 0;
    const emoji = pct === 1 ? "🎉" : pct >= 0.8 ? "🌟" : pct >= 0.6 ? "👍" : "💪";
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8 pt-4">
            <p className="text-6xl mb-4">{emoji}</p>
            <p className="text-4xl font-bold text-foreground mb-1">{score}<span className="text-muted-foreground text-2xl"> / {questions.length}</span></p>
            <p className="text-muted-foreground mt-2">{pct === 1 ? "Perfect score!" : pct >= 0.8 ? "Excellent work!" : pct >= 0.6 ? "Good effort!" : "Keep practicing!"}</p>
          </div>
          {wrongAnswers.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Review Mistakes</p>
              <div className="space-y-2">
                {wrongAnswers.map((wa, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-3.5 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{wa.word.term}</p>
                      <p className="text-xs text-emerald-400">✓ {wa.word.translation}</p>
                      {wa.chosenDisplay && <p className="text-xs text-red-400 mt-0.5">✗ You wrote: "{wa.chosenDisplay}"</p>}
                    </div>
                    <button onClick={() => starMutation.mutate({ id: wa.word.id })} className={cn("p-1.5 rounded-lg transition-colors", wa.word.starred ? "text-accent" : "text-muted-foreground hover:text-accent")}>
                      <Star className={cn("w-3.5 h-3.5", wa.word.starred && "fill-current")} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={startQuiz} className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 font-bold text-primary-foreground transition-colors">New Quiz →</button>
            <button onClick={() => setPhase("select")} className="px-6 py-3 rounded-xl bg-muted hover:bg-muted/80 font-semibold text-foreground transition-colors">Settings</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "quiz" && questions.length > 0) {
    const q = questions[qIndex];
    const progress = (qIndex / questions.length) * 100;
    const isTypingMode = q.isPhrase || direction === "en2fr";

    return (
      <div className="flex-1 overflow-y-auto">
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="p-4 sm:p-6 max-w-lg mx-auto flex flex-col gap-5">
          <div className="flex justify-between items-center pt-2">
            <button onClick={() => setPhase("select")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", direction === "fr2en" ? "bg-primary/15 text-primary" : "bg-emerald-500/15 text-emerald-400")}>
                {direction === "fr2en" ? "FR → EN" : "EN → FR"}
              </span>
              <p className="text-sm font-mono text-muted-foreground">{qIndex + 1} / {questions.length}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => starMutation.mutate({ id: q.word.id })} className={cn("p-1.5 rounded-lg transition-colors", q.word.starred ? "text-accent" : "text-muted-foreground hover:text-accent")}>
                <Star className={cn("w-3.5 h-3.5", q.word.starred && "fill-current")} />
              </button>
              <p className="text-sm font-semibold text-emerald-400">{score} pts</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-card to-muted/30 rounded-2xl p-6 sm:p-8 text-center border border-border shadow-lg">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              {isTypingMode ? "Write in French:" : "What does this mean?"}
            </p>
            <div className="flex items-center justify-center gap-3">
              <p className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                {isTypingMode ? q.word.translation : q.word.term}
              </p>
              {!isTypingMode && (
                <button onClick={() => pronounce(q.word.term)} className="p-1.5 bg-muted hover:bg-muted/80 rounded-full transition-colors">
                  <Volume2 className="w-4 h-4 text-primary" />
                </button>
              )}
            </div>
          </div>

          {isTypingMode ? (
            <div className="flex flex-col gap-3">
              <input
                ref={fillRef}
                value={fillInput}
                onChange={(e) => !fillResult && setFillInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !fillGrading && handleFillSubmit()}
                placeholder="Type in French… (accents optional)"
                disabled={!!fillResult || fillGrading}
                autoFocus
                className={cn(
                  "w-full px-4 py-3 rounded-xl border text-sm transition focus:outline-none",
                  fillResult?.correct ? "bg-emerald-500/10 border-emerald-500 text-emerald-200"
                    : fillResult && !fillResult.correct ? "bg-red-500/10 border-red-500 text-red-200"
                    : "bg-card border-border text-foreground placeholder-muted-foreground focus:border-primary"
                )}
              />
              {fillResult && (
                <div className={cn("rounded-xl p-4 border", fillResult.correct ? "bg-emerald-500/10 border-emerald-700" : "bg-amber-500/10 border-amber-700")}>
                  {fillResult.correct ? (
                    <p className="text-emerald-300 font-semibold text-sm">✓ Correct!</p>
                  ) : (
                    <>
                      <p className="text-amber-300 font-semibold text-sm mb-1">The answer was:</p>
                      <div className="flex items-center gap-2">
                        <p className="text-foreground font-bold">{q.word.term}</p>
                        <button onClick={() => pronounce(q.word.term)} className="p-1 bg-muted rounded-full hover:bg-muted/80">
                          <Volume2 className="w-3.5 h-3.5 text-primary" />
                        </button>
                      </div>
                      {fillResult.note && <p className="text-xs text-amber-400 mt-1">{fillResult.note}</p>}
                    </>
                  )}
                </div>
              )}
              <button
                onClick={handleFillSubmit}
                disabled={(fillResult === null && !fillInput.trim()) || fillGrading}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2",
                  fillResult === null ? "bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50" : "bg-muted hover:bg-muted/80 text-foreground"
                )}
              >
                {fillGrading ? <><Loader2 className="w-4 h-4 animate-spin" /> Grading…</> : fillResult === null ? "Check Answer" : "Next →"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {q.choices?.map((c, i) => {
                const isCorrect = c.isCorrect;
                const isChosen = selected === c.display;
                let cls = "relative p-4 rounded-xl border text-sm font-semibold transition-all duration-200 text-left ";
                if (selected) {
                  if (isCorrect) cls += "bg-emerald-500/15 border-emerald-500 text-emerald-300";
                  else if (isChosen) cls += "bg-red-500/15 border-red-500 text-red-300";
                  else cls += "bg-muted/30 border-border text-muted-foreground opacity-50";
                } else {
                  cls += "bg-card border-border text-foreground hover:bg-muted/50 hover:border-primary/50 cursor-pointer";
                }
                return (
                  <button key={i} onClick={() => handleSelect(c)} disabled={!!selected} className={cls}>
                    {c.display}
                    {selected && isCorrect && <span className="absolute top-2 right-2 text-emerald-400">✓</span>}
                    {selected && isChosen && !isCorrect && <span className="absolute top-2 right-2 text-red-400">✗</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Select phase
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Quiz Settings</h2>
          <p className="text-sm text-muted-foreground">Choose your quiz parameters</p>
        </div>

        {/* Direction */}
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Direction</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: "fr2en" as const, label: "FR → EN", desc: "Multiple choice" },
              { id: "en2fr" as const, label: "EN → FR", desc: "Type in French" },
            ].map((d) => (
              <button
                key={d.id}
                onClick={() => setDirection(d.id)}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all",
                  direction === d.id ? "bg-primary/15 border-primary text-primary" : "bg-card border-border text-foreground hover:bg-muted/30"
                )}
              >
                <p className="font-bold text-sm">{d.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Due only toggle */}
        <div className="flex items-center justify-between bg-card border border-border rounded-xl p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Due for review only</p>
            <p className="text-xs text-muted-foreground mt-0.5">Spaced repetition scheduling</p>
          </div>
          <button
            onClick={() => setDueOnly(!dueOnly)}
            className={cn(
              "w-11 h-6 rounded-full transition-colors relative",
              dueOnly ? "bg-primary" : "bg-muted"
            )}
          >
            <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", dueOnly ? "left-5.5 translate-x-0" : "left-0.5")} />
          </button>
        </div>

        {/* Bucket selector */}
        {buckets.length > 1 && (
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Date Range</p>
            <div className="space-y-2">
              <button
                onClick={() => setSelectedBucket(null)}
                className={cn(
                  "w-full p-3 rounded-xl border text-left text-sm transition-all",
                  selectedBucket === null ? "bg-primary/15 border-primary text-primary" : "bg-card border-border text-foreground hover:bg-muted/30"
                )}
              >
                <span className="font-semibold">All words</span>
                <span className="text-muted-foreground ml-2">({words.filter((w) => w.translation).length} total)</span>
              </button>
              {buckets.map((b, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedBucket(i)}
                  className={cn(
                    "w-full p-3 rounded-xl border text-left text-sm transition-all",
                    selectedBucket === i ? "bg-primary/15 border-primary text-primary" : "bg-card border-border text-foreground hover:bg-muted/30"
                  )}
                >
                  <span className="font-semibold">{fmtRange(b.start, b.end)}</span>
                  <span className="text-muted-foreground ml-2">({b.words.length} words)</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground">
          {quizableWords.length} words available for quiz
          {dueOnly && <span className="text-accent ml-1">({words.filter(isDue).length} due)</span>}
        </div>

        <button
          onClick={startQuiz}
          disabled={quizableWords.length < 2}
          className="w-full py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold transition-colors"
        >
          Start Quiz →
        </button>
      </div>
    </div>
  );
}
