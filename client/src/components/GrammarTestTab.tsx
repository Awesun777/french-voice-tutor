/**
 * GrammarTestTab — fill-in-the-blank verb conjugation practice for B1.
 *
 * Launch screen: choose which tenses to test + how many questions.
 * Test: a sentence with a blank and the infinitive shown; type the correct
 * conjugated form. Grading is deterministic and accent/case-insensitive against
 * the answer generated server-side.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";

const TENSES: { key: string; label: string }[] = [
  { key: "present", label: "Présent" },
  { key: "passeCompose", label: "Passé composé" },
  { key: "imparfait", label: "Imparfait" },
  { key: "futurSimple", label: "Futur simple" },
  { key: "conditionnel", label: "Conditionnel présent" },
  { key: "subjonctif", label: "Subjonctif présent" },
];
const COUNTS = [5, 10, 15, 20];

interface Question {
  infinitive: string;
  tenseKey: string;
  tenseLabel: string;
  person: string;
  sentence: string;
  answer: string;
  english: string;
}

const normalize = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Render a sentence, replacing "___" with either the input field or the answer. */
function SentenceWithBlank({ sentence, children }: { sentence: string; children: React.ReactNode }) {
  const [before, after] = sentence.split("___");
  return (
    <p className="text-lg sm:text-xl text-foreground leading-relaxed text-center">
      {before}
      {children}
      {after ?? ""}
    </p>
  );
}

export default function GrammarTestTab() {
  const { speak, state: pronounceState, activeText } = usePronounce();

  const [phase, setPhase] = useState<"select" | "test" | "done">("select");
  const [selectedTenses, setSelectedTenses] = useState<Set<string>>(new Set(TENSES.map((t) => t.key)));
  const [count, setCount] = useState(10);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<Question[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const generateMutation = trpc.grammar.generateTest.useMutation();

  const toggleTense = (key: string) =>
    setSelectedTenses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const start = async () => {
    if (selectedTenses.size === 0) { toast.error("Pick at least one tense"); return; }
    try {
      const { questions: qs } = await generateMutation.mutateAsync({
        tenses: Array.from(selectedTenses) as any,
        count,
      });
      if (!qs.length) { toast.error("Couldn't generate questions — try again"); return; }
      setQuestions(qs);
      setQIndex(0);
      setInput("");
      setResult(null);
      setScore(0);
      setWrong([]);
      setPhase("test");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      toast.error("Failed to generate the test");
    }
  };

  const q = questions[qIndex];

  const submit = () => {
    if (result) { next(); return; }
    if (!input.trim()) return;
    const correct = normalize(input) === normalize(q.answer);
    setResult({ correct });
    if (correct) setScore((s) => s + 1);
    else setWrong((w) => [...w, q]);
  };

  const next = () => {
    if (qIndex + 1 >= questions.length) { setPhase("done"); return; }
    setQIndex((i) => i + 1);
    setInput("");
    setResult(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ── Done screen ────────────────────────────────────────────────────────────
  if (phase === "done") {
    const pct = questions.length ? score / questions.length : 0;
    const emoji = pct === 1 ? "🎉" : pct >= 0.8 ? "🌟" : pct >= 0.6 ? "👍" : "💪";
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8 pt-4">
            <p className="text-6xl mb-4">{emoji}</p>
            <p className="text-4xl font-bold text-foreground">{score}<span className="text-muted-foreground text-2xl"> / {questions.length}</span></p>
            <p className="text-muted-foreground mt-2">Conjugation test complete</p>
          </div>
          {wrong.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Review Mistakes</p>
              <div className="space-y-2">
                {wrong.map((w, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-3.5">
                    <p className="text-xs text-muted-foreground mb-1">{w.tenseLabel} · <span className="italic">{w.infinitive}</span></p>
                    <p className="text-sm text-foreground">{w.sentence.replace("___", `【${w.answer}】`)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-center">
            <button onClick={() => setPhase("select")} className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 font-bold text-primary-foreground transition-colors">New test →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Test screen ────────────────────────────────────────────────────────────
  if (phase === "test" && q) {
    const progress = (qIndex / questions.length) * 100;
    const filledSentence = q.sentence.replace("___", q.answer);
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} /></div>
        <div className="p-4 sm:p-6 max-w-lg mx-auto flex flex-col gap-5">
          <div className="flex justify-between items-center pt-2">
            <button onClick={() => setPhase("select")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-primary/15 text-primary">{q.tenseLabel}</span>
            <p className="text-sm font-mono text-muted-foreground">{qIndex + 1} / {questions.length}</p>
          </div>

          <p className="text-xs uppercase tracking-widest text-muted-foreground text-center">
            Complete with the correct form in the <span className="text-foreground font-semibold">{q.tenseLabel}</span>
          </p>

          <div className="bg-gradient-to-br from-card to-muted/30 rounded-2xl p-6 sm:p-8 border border-border shadow-lg">
            <SentenceWithBlank sentence={q.sentence}>
              {result ? (
                <span className={cn("font-bold px-1", result.correct ? "text-emerald-400" : "text-red-400")}>{q.answer}</span>
              ) : (
                <span className="font-bold text-primary px-1">____</span>
              )}
            </SentenceWithBlank>
            <p className="text-center text-sm text-muted-foreground mt-3">({q.infinitive})</p>
          </div>

          {!result ? (
            <div className="flex flex-col gap-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Type the conjugated form… (accents optional)"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm"
              />
              <button onClick={submit} disabled={!input.trim()} className="py-3 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 transition">Check</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className={cn("rounded-xl p-4 border flex items-start gap-3", result.correct ? "bg-emerald-500/10 border-emerald-700" : "bg-red-500/10 border-red-700")}>
                {result.correct ? <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /> : <X className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", result.correct ? "text-emerald-300" : "text-red-300")}>
                    {result.correct ? "Correct!" : <>Answer: <span className="text-foreground font-bold">{q.answer}</span></>}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-foreground">{filledSentence}</p>
                    <PronounceButton text={filledSentence} speak={speak} state={pronounceState} activeText={activeText} className="p-1 bg-muted hover:bg-muted/80 text-primary shrink-0" iconSize="w-3.5 h-3.5" />
                  </div>
                  {q.english && <p className="text-xs text-muted-foreground mt-1">{q.english}</p>}
                </div>
              </div>
              <button onClick={next} className="py-3 rounded-xl font-bold text-sm bg-muted hover:bg-muted/80 text-foreground transition">
                {qIndex + 1 >= questions.length ? "See results →" : "Next →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Select screen ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto space-y-6">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-xl font-bold text-foreground">Grammar Test</h2>
              <p className="text-sm text-muted-foreground">Conjugate verbs to fill the blank</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Tenses to test</p>
            <div className="grid grid-cols-2 gap-2">
              {TENSES.map((t) => {
                const on = selectedTenses.has(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTense(t.key)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-xl border text-left text-sm font-semibold transition-all",
                      on ? "bg-primary/15 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    <span className={cn("w-4 h-4 rounded flex items-center justify-center border shrink-0", on ? "bg-primary border-primary" : "border-border")}>
                      {on && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Number of questions</p>
            <div className="flex gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                    count === n ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Verbs come from your library plus a B1 exam-prep bank. Answers are graded ignoring accents and case.
          </p>
        </div>
      </div>

      <div className="flex-shrink-0 p-4 border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-md mx-auto">
          <button
            onClick={start}
            disabled={generateMutation.isPending || selectedTenses.size === 0}
            className="w-full py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
          >
            {generateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : "Start test →"}
          </button>
        </div>
      </div>
    </div>
  );
}
