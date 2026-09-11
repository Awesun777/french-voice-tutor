/**
 * TCF mock exam (admin-only).
 *
 * A 40-question paper in the official tout-public layout — 15 listening,
 * 10 structure, 15 reading — built from Romaintalk's OWN items in
 * shared/tcfMockExams.ts (no third-party exam content). What the official
 * trainers lack and this adds: a transcript toggle for every listening item,
 * a per-question answer check with the author's key point, and an AI
 * explanation on demand (cached server-side, so it is generated once).
 *
 * Listening audio is synthesised one speaker turn at a time (distinct voices
 * per speaker) and played back as a sequence with short gaps, the way the
 * real test plays "document, pause, question".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trophy,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { idleContainer, idleItem } from "@/components/idleReveal";
import {
  DEFAULT_TCF_MOCK_EXAM,
  SPEAKER_LABEL,
  TCF_MOCK_EXAMS,
  TCF_SECTION_META,
  consigneFor,
  type TcfLetter,
  type TcfMockItem,
  type TcfSection,
  type TcfSpeaker,
} from "@shared/tcfMockExams";

const LETTERS: TcfLetter[] = ["A", "B", "C", "D"];
const SECTIONS: TcfSection[] = ["oral", "structure", "ecrit"];
const SECTION_SHORT: Record<TcfSection, string> = { oral: "CO", structure: "SL", ecrit: "CE" };

type Turn = { speaker: TcfSpeaker; text: string; url: string };

interface Persisted {
  answers: Record<number, TcfLetter>;
  checked: number[];
}

function storageKey(examId: string) {
  return `rt-tcf-mock:${examId}`;
}

function loadPersisted(examId: string): Persisted {
  try {
    const raw = localStorage.getItem(storageKey(examId));
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object") {
        return { answers: p.answers ?? {}, checked: Array.isArray(p.checked) ? p.checked : [] };
      }
    }
  } catch {
    /* ignore */
  }
  return { answers: {}, checked: [] };
}

function b64ToUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function TcfMockTab() {
  const [examId] = useState(DEFAULT_TCF_MOCK_EXAM.id);
  const exam = TCF_MOCK_EXAMS[examId] ?? DEFAULT_TCF_MOCK_EXAM;
  const items = exam.items;

  const [n, setN] = useState(1);
  const [{ answers, checked }, setProgress] = useState<Persisted>(() => loadPersisted(examId));
  const [transcriptOpen, setTranscriptOpen] = useState<Record<number, boolean>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  const item = items.find(it => it.n === n) ?? items[0];
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const isChecked = checkedSet.has(item.n);
  const chosen = answers[item.n];

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(examId), JSON.stringify({ answers, checked }));
    } catch {
      /* ignore */
    }
  }, [examId, answers, checked]);

  // ── audio ──
  const audioMut = trpc.tcf.audio.useMutation({ trpc: { context: { skipBatch: true } } });
  const turnsRef = useRef(new Map<number, Turn[]>());
  const inflightRef = useRef(new Map<number, Promise<Turn[]>>());
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const [turnIdx, setTurnIdx] = useState(-1);
  const playTokenRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const loadTurns = useCallback(
    (it: TcfMockItem): Promise<Turn[]> => {
      const hit = turnsRef.current.get(it.n);
      if (hit) return Promise.resolve(hit);
      const pending = inflightRef.current.get(it.n);
      if (pending) return pending;
      const p = audioMut
        .mutateAsync({ examId, n: it.n })
        .then(res => {
          const turns = res.turns.map(t => ({ speaker: t.speaker, text: t.text, url: b64ToUrl(t.base64, t.mimeType) }));
          turnsRef.current.set(it.n, turns);
          return turns;
        })
        .finally(() => inflightRef.current.delete(it.n));
      inflightRef.current.set(it.n, p);
      return p;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examId]
  );

  const stopAudio = useCallback(() => {
    playTokenRef.current++;
    const a = currentAudioRef.current;
    if (a) {
      a.pause();
      a.src = "";
      currentAudioRef.current = null;
    }
    setAudioState("idle");
    setTurnIdx(-1);
  }, []);

  const playItem = useCallback(
    async (it: TcfMockItem) => {
      stopAudio();
      const token = ++playTokenRef.current;
      setAudioState("loading");
      let turns: Turn[];
      try {
        turns = await loadTurns(it);
      } catch (e) {
        if (token === playTokenRef.current) setAudioState("idle");
        toast.error(`Audio indisponible : ${String((e as Error)?.message ?? e).slice(0, 120)}`);
        return;
      }
      if (token !== playTokenRef.current) return;
      setAudioState("playing");
      for (let i = 0; i < turns.length; i++) {
        if (token !== playTokenRef.current) return;
        const t = turns[i];
        // Longer beat before the narrator's question / each "Réponse X" cue.
        const gap = i === 0 ? 0 : t.speaker === "narratrice" ? 1100 : 600;
        if (gap) await sleep(gap);
        if (token !== playTokenRef.current) return;
        setTurnIdx(i);
        await new Promise<void>(resolve => {
          const a = new Audio(t.url);
          currentAudioRef.current = a;
          a.onended = () => resolve();
          a.onerror = () => resolve();
          a.play().catch(() => resolve());
        });
      }
      if (token === playTokenRef.current) {
        setAudioState("idle");
        setTurnIdx(-1);
        currentAudioRef.current = null;
      }
    },
    [loadTurns, stopAudio]
  );

  // Stop on question change; warm the next listening item's audio.
  useEffect(() => {
    stopAudio();
    const next = items.find(it => it.n === item.n + 1);
    if (next?.audio) loadTurns(next).catch(() => {});
    if (item.audio) loadTurns(item).catch(() => {});
  }, [item.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── explanation ──
  const explainMut = trpc.tcf.explain.useMutation({ trpc: { context: { skipBatch: true } } });
  const explain = useCallback(
    async (force = false) => {
      try {
        const res = await explainMut.mutateAsync({ examId, n: item.n, force });
        setExplanations(prev => ({ ...prev, [item.n]: res.explanation }));
      } catch (e) {
        toast.error(String((e as Error)?.message ?? e).slice(0, 160));
      }
    },
    [examId, item.n, explainMut]
  );

  // ── answering ──
  const choose = (letter: TcfLetter) => {
    if (isChecked) return;
    setProgress(p => ({ ...p, answers: { ...p.answers, [item.n]: letter } }));
  };
  const check = () => {
    if (!chosen) {
      toast.message("Choisissez d'abord une réponse.");
      return;
    }
    setProgress(p => ({ ...p, checked: p.checked.includes(item.n) ? p.checked : [...p.checked, item.n] }));
  };
  const reset = () => {
    if (!window.confirm("Effacer toutes les réponses de cette série ?")) return;
    setProgress({ answers: {}, checked: [] });
    setExplanations({});
    setTranscriptOpen({});
    setShowResults(false);
    setN(1);
  };

  const go = (target: number) => {
    if (target < 1 || target > items.length) return;
    setN(target);
    setShowResults(false);
  };

  // ── scoring ──
  const score = useMemo(() => {
    const per: Record<TcfSection, { right: number; answered: number; total: number }> = {
      oral: { right: 0, answered: 0, total: 0 },
      structure: { right: 0, answered: 0, total: 0 },
      ecrit: { right: 0, answered: 0, total: 0 },
    };
    for (const it of items) {
      per[it.section].total++;
      const a = answers[it.n];
      if (a) per[it.section].answered++;
      if (a && a === it.answer) per[it.section].right++;
    }
    const right = SECTIONS.reduce((s, k) => s + per[k].right, 0);
    const answered = SECTIONS.reduce((s, k) => s + per[k].answered, 0);
    return { per, right, answered, total: items.length };
  }, [items, answers]);

  const transcriptShown = !!transcriptOpen[item.n];
  const revealChoiceText = !item.spokenChoices || isChecked || transcriptShown;
  const explanation = explanations[item.n];

  return (
    <div className="h-full overflow-y-auto">
      <motion.div variants={idleContainer} initial="hidden" animate="show" className="mx-auto max-w-4xl px-4 py-6 md:px-6 space-y-5">
        {/* header */}
        <motion.div variants={idleItem} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-display text-[11px] font-bold uppercase tracking-wider text-amber-700">Test Mock · admin</div>
            <h1 className="font-display text-2xl font-bold">{exam.title}</h1>
            <p className="text-sm text-muted-foreground">
              40 questions · compréhension orale, structure de la langue, compréhension écrite. Contenu original Romaintalk.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold tabular-nums">
              {score.answered}/{score.total} répondues
            </span>
            <button
              onClick={() => setShowResults(s => !s)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all",
                showResults ? "border-amber-500/60 bg-amber-500/10 text-amber-800" : "border-border bg-card hover:border-amber-500/60 hover:bg-amber-500/5"
              )}
            >
              <Trophy className="h-4 w-4" /> Résultats
            </button>
            <button
              onClick={reset}
              title="Recommencer la série"
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-all hover:border-red-400/60 hover:bg-red-500/5"
            >
              <RotateCcw className="h-4 w-4" /> Recommencer
            </button>
          </div>
        </motion.div>

        {/* navigator */}
        <motion.div variants={idleItem} className="bg-card card-float rounded-2xl border border-border p-3 md:p-4 space-y-3">
          {SECTIONS.map(sec => {
            const [lo, hi] = TCF_SECTION_META[sec].range;
            return (
              <div key={sec} className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 w-8 shrink-0 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground" title={TCF_SECTION_META[sec].label}>
                  {SECTION_SHORT[sec]}
                </span>
                {items
                  .filter(it => it.n >= lo && it.n <= hi)
                  .map(it => {
                    const a = answers[it.n];
                    const c = checkedSet.has(it.n);
                    const state = c ? (a === it.answer ? "right" : "wrong") : a ? "answered" : "blank";
                    return (
                      <button
                        key={it.n}
                        onClick={() => go(it.n)}
                        className={cn(
                          "h-8 w-8 rounded-lg text-xs font-semibold tabular-nums transition-all border",
                          it.n === item.n && !showResults ? "ring-2 ring-amber-500 ring-offset-1 ring-offset-background" : "",
                          state === "right" && "border-emerald-500/50 bg-emerald-500/15 text-emerald-800",
                          state === "wrong" && "border-red-500/50 bg-red-500/15 text-red-800",
                          state === "answered" && "border-border bg-muted text-foreground",
                          state === "blank" && "border-border bg-card text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {it.n}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </motion.div>

        {showResults ? (
          <ResultsCard score={score} items={items} answers={answers} onGo={go} />
        ) : (
          <motion.div variants={idleItem} className="bg-card card-float rounded-2xl border border-border p-4 md:p-6 space-y-5">
            {/* consigne */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
                  {String(item.n).padStart(2, "0")}/{items.length}
                </span>
                <span className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {TCF_SECTION_META[item.section].label}
                </span>
              </div>
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground" title="Niveau visé">
                {item.level}
              </span>
            </div>
            <p className="text-center text-sm font-medium">{consigneFor(item)}</p>

            {/* media */}
            {item.audio && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => (audioState === "idle" ? playItem(item) : stopAudio())}
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full text-white transition-all",
                      audioState === "idle" ? "bg-amber-600 hover:bg-amber-600/90" : "bg-neutral-700 hover:bg-neutral-700/90"
                    )}
                    title={audioState === "idle" ? "Écouter" : "Arrêter"}
                  >
                    {audioState === "loading" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : audioState === "playing" ? (
                      <Square className="h-4 w-4" fill="currentColor" />
                    ) : (
                      <Play className="h-5 w-5" fill="currentColor" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold">
                      {audioState === "loading" && "Préparation de l'audio…"}
                      {audioState === "playing" && turnIdx >= 0 && `${SPEAKER_LABEL[item.audio[turnIdx]?.speaker ?? "narratrice"]} · tour ${turnIdx + 1}/${item.audio.length}`}
                      {audioState === "idle" && "Document sonore"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.audio.length} tours de parole · le document se joue en entier, puis la question.
                    </div>
                  </div>
                  <button
                    onClick={() => setTranscriptOpen(t => ({ ...t, [item.n]: !t[item.n] }))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-all",
                      transcriptShown ? "border-amber-500/60 bg-amber-500/10 text-amber-800" : "border-border bg-card hover:border-amber-500/60 hover:bg-amber-500/5"
                    )}
                  >
                    <FileText className="h-4 w-4" /> Transcription
                  </button>
                </div>
                {transcriptShown && (
                  <div className="rounded-xl border border-border bg-card p-3 text-sm leading-relaxed space-y-1.5">
                    {item.audio.map((seg, i) => (
                      <p key={i} className={cn(i === turnIdx && audioState === "playing" && "text-amber-800 font-medium")}>
                        <span className="mr-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {SPEAKER_LABEL[seg.speaker]}
                        </span>
                        {seg.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {item.passage && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4 md:p-5 font-serif text-[15px] leading-relaxed whitespace-pre-line">
                {item.passage}
              </div>
            )}

            {item.question && <p className="text-lg font-semibold leading-snug">{item.question}</p>}

            {/* choices */}
            <div className="grid gap-2 sm:grid-cols-2">
              {LETTERS.map((letter, i) => {
                const text = revealChoiceText ? item.choices[i] : `Réponse ${letter}`;
                const isChosen = chosen === letter;
                const isRight = item.answer === letter;
                const tone = isChecked
                  ? isRight
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : isChosen
                      ? "border-red-500/60 bg-red-500/10"
                      : "border-border bg-card opacity-70"
                  : isChosen
                    ? "border-amber-500/70 bg-amber-500/10"
                    : "border-border bg-card hover:border-amber-500/60 hover:bg-amber-500/5";
                return (
                  <button
                    key={letter}
                    onClick={() => choose(letter)}
                    disabled={isChecked}
                    className={cn("flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-all disabled:cursor-default", tone)}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        isChecked && isRight ? "bg-emerald-600 text-white" : isChecked && isChosen ? "bg-red-600 text-white" : isChosen ? "bg-amber-600 text-white" : "bg-muted text-foreground"
                      )}
                    >
                      {isChecked && isRight ? <Check className="h-3.5 w-3.5" /> : isChecked && isChosen ? <X className="h-3.5 w-3.5" /> : letter}
                    </span>
                    <span className="leading-snug">{text}</span>
                  </button>
                );
              })}
            </div>

            {/* actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={() => go(item.n - 1)}
                disabled={item.n <= 1}
                className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold transition-all hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Précédente
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={check}
                  disabled={isChecked}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-600/90 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" /> Vérifier
                </button>
                <button
                  onClick={() => explain(false)}
                  disabled={explainMut.isPending}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold transition-all hover:border-amber-500/60 hover:bg-amber-500/5 disabled:opacity-60"
                >
                  {explainMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Expliquer (IA)
                </button>
              </div>
              <button
                onClick={() => (item.n >= items.length ? setShowResults(true) : go(item.n + 1))}
                className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold transition-all hover:bg-muted"
              >
                {item.n >= items.length ? "Terminer" : "Suivante"} <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* feedback */}
            {isChecked && (
              <div
                className={cn(
                  "rounded-xl border p-3 text-sm",
                  chosen === item.answer ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
                )}
              >
                <div className="font-semibold">{chosen === item.answer ? "Bonne réponse !" : `Mauvaise réponse — la bonne réponse est ${item.answer}.`}</div>
                <div className="mt-1 text-muted-foreground">{item.note}</div>
              </div>
            )}

            {explanation && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    <Sparkles className="h-3.5 w-3.5" /> Explication
                  </div>
                  <button onClick={() => explain(true)} disabled={explainMut.isPending} className="text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">
                    Régénérer
                  </button>
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <Streamdown>{explanation}</Streamdown>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function ResultsCard({
  score,
  items,
  answers,
  onGo,
}: {
  score: { per: Record<TcfSection, { right: number; answered: number; total: number }>; right: number; answered: number; total: number };
  items: TcfMockItem[];
  answers: Record<number, TcfLetter>;
  onGo: (n: number) => void;
}) {
  const wrong = items.filter(it => answers[it.n] && answers[it.n] !== it.answer);
  const blank = items.filter(it => !answers[it.n]);
  return (
    <motion.div variants={idleItem} className="bg-card card-float rounded-2xl border border-border p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Résultats</div>
          <div className="font-display text-4xl font-bold tabular-nums">
            {score.right}
            <span className="text-xl text-muted-foreground">/{score.total}</span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {score.answered < score.total ? `${score.total - score.answered} question(s) sans réponse.` : "Toutes les questions ont une réponse."}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {SECTIONS.map(sec => {
          const s = score.per[sec];
          const pct = s.total ? Math.round((100 * s.right) / s.total) : 0;
          return (
            <div key={sec} className="rounded-xl border border-border p-3">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{TCF_SECTION_META[sec].label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {s.right}
                <span className="text-sm text-muted-foreground">/{s.total}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-amber-600" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {wrong.length > 0 && (
        <div>
          <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">À revoir</div>
          <div className="flex flex-wrap gap-1.5">
            {wrong.map(it => (
              <button key={it.n} onClick={() => onGo(it.n)} className="rounded-lg border border-red-500/50 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-500/20">
                {it.n} · {SECTION_SHORT[it.section]} · vous {answers[it.n]} / correct {it.answer}
              </button>
            ))}
          </div>
        </div>
      )}
      {blank.length > 0 && (
        <div>
          <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sans réponse</div>
          <div className="flex flex-wrap gap-1.5">
            {blank.map(it => (
              <button key={it.n} onClick={() => onGo(it.n)} className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted">
                {it.n}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
