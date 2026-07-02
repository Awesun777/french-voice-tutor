/**
 * GrammarTestTab — fill-in-the-blank verb conjugation practice for B1.
 *
 * Launch screen: choose which tenses to test + how many questions.
 * Test: a sentence with a blank and the infinitive shown; type the correct
 * conjugated form. Grading is deterministic and accent/case-insensitive against
 * the answer generated server-side.
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, GraduationCap, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";
import type { DictWordResult } from "@/types";

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

const PERSON_LABELS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];

/** Attach a subject pronoun to a form, eliding "je" → "j'" before a vowel/mute-h. */
function withPronoun(pron: string, form: string): string {
  const first = form.normalize("NFD").replace(/[̀-ͯ]/g, "")[0]?.toLowerCase();
  if (pron === "je" && first && "aeiouyh".includes(first)) return `j'${form}`;
  return `${pron} ${form}`;
}

const TENSE_LABELS: Record<string, string> = {
  present: "Présent",
  passeCompose: "Passé composé",
  imparfait: "Imparfait",
  futurSimple: "Futur simple",
  conditionnel: "Conditionnel",
  subjonctif: "Subjonctif",
};
const TENSE_ORDER = ["present", "passeCompose", "imparfait", "futurSimple", "conditionnel", "subjonctif"];

/**
 * Conjugation reference for the "Grammar notes" panel. Fully-worked model verbs
 * for the three regular groups plus the two auxiliaries, one row per subject
 * (je→ils/elles), across the six tested tenses.
 */
interface ModelVerb {
  infinitive: string;
  heading: string;
  tenses: Record<string, string[]>; // 6 forms, je→ils/elles
}
const MODEL_VERBS: ModelVerb[] = [
  {
    infinitive: "parler",
    heading: "-ER verbs (parler → parl-)",
    tenses: {
      present: ["parle", "parles", "parle", "parlons", "parlez", "parlent"],
      passeCompose: ["ai parlé", "as parlé", "a parlé", "avons parlé", "avez parlé", "ont parlé"],
      imparfait: ["parlais", "parlais", "parlait", "parlions", "parliez", "parlaient"],
      futurSimple: ["parlerai", "parleras", "parlera", "parlerons", "parlerez", "parleront"],
      conditionnel: ["parlerais", "parlerais", "parlerait", "parlerions", "parleriez", "parleraient"],
      subjonctif: ["parle", "parles", "parle", "parlions", "parliez", "parlent"],
    },
  },
  {
    infinitive: "finir",
    heading: "-IR verbs (finir → fin- / finiss-)",
    tenses: {
      present: ["finis", "finis", "finit", "finissons", "finissez", "finissent"],
      passeCompose: ["ai fini", "as fini", "a fini", "avons fini", "avez fini", "ont fini"],
      imparfait: ["finissais", "finissais", "finissait", "finissions", "finissiez", "finissaient"],
      futurSimple: ["finirai", "finiras", "finira", "finirons", "finirez", "finiront"],
      conditionnel: ["finirais", "finirais", "finirait", "finirions", "finiriez", "finiraient"],
      subjonctif: ["finisse", "finisses", "finisse", "finissions", "finissiez", "finissent"],
    },
  },
  {
    infinitive: "vendre",
    heading: "-RE verbs (vendre → vend-)",
    tenses: {
      present: ["vends", "vends", "vend", "vendons", "vendez", "vendent"],
      passeCompose: ["ai vendu", "as vendu", "a vendu", "avons vendu", "avez vendu", "ont vendu"],
      imparfait: ["vendais", "vendais", "vendait", "vendions", "vendiez", "vendaient"],
      futurSimple: ["vendrai", "vendras", "vendra", "vendrons", "vendrez", "vendront"],
      conditionnel: ["vendrais", "vendrais", "vendrait", "vendrions", "vendriez", "vendraient"],
      subjonctif: ["vende", "vendes", "vende", "vendions", "vendiez", "vendent"],
    },
  },
  {
    infinitive: "avoir",
    heading: "avoir (auxiliary — most passé composé)",
    tenses: {
      present: ["ai", "as", "a", "avons", "avez", "ont"],
      passeCompose: ["ai eu", "as eu", "a eu", "avons eu", "avez eu", "ont eu"],
      imparfait: ["avais", "avais", "avait", "avions", "aviez", "avaient"],
      futurSimple: ["aurai", "auras", "aura", "aurons", "aurez", "auront"],
      conditionnel: ["aurais", "aurais", "aurait", "aurions", "auriez", "auraient"],
      subjonctif: ["aie", "aies", "ait", "ayons", "ayez", "aient"],
    },
  },
  {
    infinitive: "être",
    heading: "être (auxiliary — motion & pronominal verbs)",
    tenses: {
      present: ["suis", "es", "est", "sommes", "êtes", "sont"],
      passeCompose: ["ai été", "as été", "a été", "avons été", "avez été", "ont été"],
      imparfait: ["étais", "étais", "était", "étions", "étiez", "étaient"],
      futurSimple: ["serai", "seras", "sera", "serons", "serez", "seront"],
      conditionnel: ["serais", "serais", "serait", "serions", "seriez", "seraient"],
      subjonctif: ["sois", "sois", "soit", "soyons", "soyez", "soient"],
    },
  },
];

/** Grammar-notes panel: subject/tense conjugation reference for verb review. */
function GrammarNotesPanel({ speak, pronounceState, activeText }: {
  speak: (t: string) => void;
  pronounceState: import("@/lib/pronounce").PronounceState;
  activeText: string | null;
}) {
  const [openVerb, setOpenVerb] = useState<string>(MODEL_VERBS[0].infinitive);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-700/40 bg-amber-500/10 p-3 text-xs text-amber-100/90 leading-relaxed">
        <p className="font-bold text-amber-300 mb-1">Passé composé</p>
        <p>auxiliary (<span className="italic">avoir</span> / <span className="italic">être</span>) in the présent + past participle
        (-ER → <span className="italic">-é</span>, -IR → <span className="italic">-i</span>, -RE → <span className="italic">-u</span>).
        Verbs of motion (aller, venir, partir…) and all pronominal verbs use <span className="italic">être</span>, and the
        participle then agrees with the subject (elle est allé<span className="italic">e</span>).</p>
      </div>
      {MODEL_VERBS.map((mv) => {
        const open = openVerb === mv.infinitive;
        return (
          <div key={mv.infinitive} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setOpenVerb(open ? "" : mv.infinitive)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              <span className="text-sm font-semibold text-foreground">{mv.heading}</span>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {open && (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TENSE_ORDER.map((tk) => (
                  <div key={tk}>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1.5">{TENSE_LABELS[tk]}</p>
                    <div className="space-y-0.5">
                      {mv.tenses[tk].map((form, i) => {
                        const full = withPronoun(PERSON_LABELS[i], form);
                        return (
                          <div key={i} className="flex items-center gap-1.5 text-sm">
                            <PronounceButton text={full} speak={speak} state={pronounceState} activeText={activeText} className="p-0.5 hover:bg-primary/15 text-muted-foreground hover:text-primary shrink-0" iconSize="w-3 h-3" />
                            <span className="text-foreground">{full}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Dictionary lookup for the current question's infinitive, rendered at the very
 * bottom of the test screen so it never pushes the blank/answer section around.
 *
 * The lookup and the word's pronunciation are preloaded as soon as the question
 * mounts (this component is keyed by question), so opening the panel is instant.
 * `visible` is controlled by the trigger next to the sentence.
 */
function InfinitiveLookupPanel({ infinitive, visible, speak, preload, pronounceState, activeText }: {
  infinitive: string;
  visible: boolean;
  speak: (t: string) => void;
  preload: (t: string) => Promise<void>;
  pronounceState: import("@/lib/pronounce").PronounceState;
  activeText: string | null;
}) {
  const search = trpc.dictionary.search.useMutation();
  const result = search.data as DictWordResult | undefined;

  // Warm the dictionary entry + TTS the moment the question appears.
  useEffect(() => {
    search.mutate({ term: infinitive });
    void preload(infinitive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infinitive]);

  if (!visible) return null;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 text-left">
      {search.isPending || !search.data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
        </div>
      ) : result?.type === "word" && result.found ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-foreground">{result.word}</span>
            {result.pronunciation && <span className="text-xs text-muted-foreground font-mono">[{result.pronunciation}]</span>}
            <PronounceButton text={result.word} speak={speak} state={pronounceState} activeText={activeText} className="p-1 bg-primary/15 hover:bg-primary/25 text-primary" iconSize="w-3.5 h-3.5" />
          </div>
          <p className="text-sm text-foreground">{result.translation}</p>
          {result.grammar && <p className="text-xs text-muted-foreground italic">{result.grammar}</p>}
          {result.conjugations && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {TENSE_ORDER.filter((tk) => result.conjugations[tk as keyof typeof result.conjugations]?.length).map((tk) => (
                <div key={tk}>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1.5">{TENSE_LABELS[tk]}</p>
                  <div className="space-y-0.5">
                    {result.conjugations[tk as keyof typeof result.conjugations].map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-sm">
                        <PronounceButton text={f} speak={speak} state={pronounceState} activeText={activeText} className="p-0.5 hover:bg-primary/15 text-muted-foreground hover:text-primary shrink-0" iconSize="w-3 h-3" />
                        <span className="text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-1">No dictionary entry found.</p>
      )}
    </div>
  );
}

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
  const { speak, preload, state: pronounceState, activeText } = usePronounce();

  const [phase, setPhase] = useState<"select" | "test" | "done">("select");
  const [selectedTenses, setSelectedTenses] = useState<Set<string>>(new Set(TENSES.map((t) => t.key)));
  const [count, setCount] = useState(10);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<Question[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [showLookup, setShowLookup] = useState(false);
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
      setShowLookup(false);
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
    setShowLookup(false);
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

          <button
            onClick={() => setShowNotes((s) => !s)}
            className={cn(
              "self-center flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors",
              showNotes ? "bg-amber-500/15 border-amber-600/50 text-amber-300" : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            {showNotes ? "Hide grammar notes" : "Grammar notes"}
          </button>

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
            <p className="text-center text-sm text-muted-foreground mt-3">
              (
              <button
                onClick={() => setShowLookup((s) => !s)}
                className={cn(
                  "font-medium underline decoration-dotted underline-offset-2 transition-colors",
                  showLookup ? "text-primary/80" : "text-primary hover:text-primary/80"
                )}
                title="Don't know this verb? Tap to look it up"
              >
                {q.infinitive}
              </button>
              )
            </p>
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

          {/* Dictionary lookup — pinned to the bottom so it never shifts the answer box.
              Preloads on mount (keyed by question) even while hidden. */}
          <InfinitiveLookupPanel
            key={qIndex}
            infinitive={q.infinitive}
            visible={showLookup}
            speak={speak}
            preload={preload}
            pronounceState={pronounceState}
            activeText={activeText}
          />
        </div>

        {/* Grammar notes — right-side drawer so it doesn't squeeze the question out.
            On small screens a tap-to-close backdrop dims the test; on large screens
            there's no backdrop, so notes and the exercise stay visible together. */}
        {showNotes && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setShowNotes(false)} />
            <aside className="fixed inset-y-0 right-0 z-50 w-[92%] max-w-md bg-background border-l border-border shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-foreground">Grammar notes</span>
                </div>
                <button
                  onClick={() => setShowNotes(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <GrammarNotesPanel speak={speak} pronounceState={pronounceState} activeText={activeText} />
              </div>
            </aside>
          </>
        )}
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
