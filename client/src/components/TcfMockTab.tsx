/**
 * TCF mock exam (admin-only).
 *
 * A 40-question paper in the official tout-public layout — 15 listening,
 * 10 structure, 15 reading. Two sources, one UI:
 *  - Romaintalk's own series (shared/tcfMockExams.ts), audio synthesised per
 *    speaker turn with distinct voices;
 *  - TV5MONDE / FEI training booklets ingested into MySQL by
 *    scripts/tcf_tv5_ingest.py (one clip + Whisper transcript per listening
 *    item, the reading document as a photo). Admin-only, unmonetised.
 *
 * What the official trainers lack and this adds: a transcript toggle for
 * every listening item, a per-question answer check, and an AI explanation
 * on demand (cached server-side, so it is generated once).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SPEAKER_LABEL, TCF_SECTION_META, type TcfLetter, type TcfSection } from "@shared/tcfMockExams";

const LETTERS: TcfLetter[] = ["A", "B", "C", "D"];
const SECTIONS: TcfSection[] = ["oral", "structure", "ecrit"];
const SECTION_SHORT: Record<TcfSection, string> = { oral: "CO", structure: "SL", ecrit: "CE" };
const DEFAULT_EXAM = "romaintalk-1";

type Speaker = keyof typeof SPEAKER_LABEL;
type Turn = { speaker: Speaker; text: string; url: string };
type Media = { turns?: Turn[]; clipUrl?: string; imageUrl?: string | null };

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
  const [examId, setExamId] = useState<string>(() => {
    try {
      return localStorage.getItem("rt-tcf-mock:exam") || DEFAULT_EXAM;
    } catch {
      return DEFAULT_EXAM;
    }
  });
  const examsQ = trpc.tcf.exams.useQuery();
  const examQ = trpc.tcf.exam.useQuery({ examId }, { staleTime: 5 * 60_000 });
  const items = examQ.data?.items ?? [];
  const title = examQ.data?.summary.title ?? "";
  const source = examQ.data?.summary.source;

  const [n, setN] = useState(1);
  const [{ answers, checked }, setProgress] = useState<Persisted>(() => loadPersisted(examId));
  const [transcriptOpen, setTranscriptOpen] = useState<Record<number, boolean>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);

  // Switching exams: persist the choice, reload that exam's progress.
  const switchExam = (id: string) => {
    if (id === examId) return;
    stopAudio();
    setExamId(id);
    try {
      localStorage.setItem("rt-tcf-mock:exam", id);
    } catch {
      /* ignore */
    }
    setProgress(loadPersisted(id));
    setExplanations({});
    setTranscriptOpen({});
    setShowResults(false);
    setN(1);
    mediaRef.current.clear();
    inflightRef.current.clear();
  };

  const item = items.find(it => it.n === n) ?? items[0];
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const isChecked = item ? checkedSet.has(item.n) : false;
  const chosen = item ? answers[item.n] : undefined;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(examId), JSON.stringify({ answers, checked }));
    } catch {
      /* ignore */
    }
  }, [examId, answers, checked]);

  // ── media (audio turns / clip, document image) ──
  const mediaMut = trpc.tcf.media.useMutation({ trpc: { context: { skipBatch: true } } });
  const mediaRef = useRef(new Map<string, Media>());
  const inflightRef = useRef(new Map<string, Promise<Media>>());
  const [mediaTick, setMediaTick] = useState(0); // re-render when a fetch lands
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">("idle");
  const [turnIdx, setTurnIdx] = useState(-1);
  const playTokenRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const loadMedia = useCallback(
    (exam: string, qn: number): Promise<Media> => {
      const key = `${exam}:${qn}`;
      const hit = mediaRef.current.get(key);
      if (hit) return Promise.resolve(hit);
      const pending = inflightRef.current.get(key);
      if (pending) return pending;
      const p = mediaMut
        .mutateAsync({ examId: exam, n: qn })
        .then(res => {
          const m: Media = {};
          if (res.turns) m.turns = res.turns.map(t => ({ speaker: t.speaker, text: t.text, url: b64ToUrl(t.base64, t.mimeType) }));
          if (res.clip) m.clipUrl = b64ToUrl(res.clip.base64, res.clip.mimeType);
          m.imageUrl = res.image ? b64ToUrl(res.image.base64, res.image.mimeType) : null;
          mediaRef.current.set(key, m);
          setMediaTick(t => t + 1);
          return m;
        })
        .finally(() => inflightRef.current.delete(key));
      inflightRef.current.set(key, p);
      return p;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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

  const playOne = (url: string) =>
    new Promise<void>(resolve => {
      const a = new Audio(url);
      currentAudioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });

  const playItem = useCallback(
    async (qn: number) => {
      stopAudio();
      const token = ++playTokenRef.current;
      setAudioState("loading");
      let m: Media;
      try {
        m = await loadMedia(examId, qn);
      } catch (e) {
        if (token === playTokenRef.current) setAudioState("idle");
        toast.error(`Audio indisponible : ${String((e as Error)?.message ?? e).slice(0, 120)}`);
        return;
      }
      if (token !== playTokenRef.current) return;
      setAudioState("playing");
      if (m.turns) {
        for (let i = 0; i < m.turns.length; i++) {
          if (token !== playTokenRef.current) return;
          const t = m.turns[i];
          // Longer beat before the narrator's question / each "Réponse X" cue.
          const gap = i === 0 ? 0 : t.speaker === "narratrice" ? 1100 : 600;
          if (gap) await sleep(gap);
          if (token !== playTokenRef.current) return;
          setTurnIdx(i);
          await playOne(t.url);
        }
      } else if (m.clipUrl) {
        await playOne(m.clipUrl);
      }
      if (token === playTokenRef.current) {
        setAudioState("idle");
        setTurnIdx(-1);
        currentAudioRef.current = null;
      }
    },
    [examId, loadMedia, stopAudio]
  );

  // Stop on question change; warm this item's media and the next one's.
  useEffect(() => {
    stopAudio();
    if (!item) return;
    if (item.hasAudio || item.hasImage) loadMedia(examId, item.n).catch(() => {});
    const next = items.find(it => it.n === item.n + 1);
    if (next && (next.hasAudio || next.hasImage)) loadMedia(examId, next.n).catch(() => {});
  }, [examId, item?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── explanation ──
  const explainMut = trpc.tcf.explain.useMutation({ trpc: { context: { skipBatch: true } } });
  const explain = useCallback(
    async (force = false) => {
      if (!item) return;
      try {
        const res = await explainMut.mutateAsync({ examId, n: item.n, force });
        setExplanations(prev => ({ ...prev, [item.n]: res.explanation }));
      } catch (e) {
        toast.error(String((e as Error)?.message ?? e).slice(0, 160));
      }
    },
    [examId, item, explainMut]
  );

  // ── answering ──
  const choose = (letter: TcfLetter) => {
    if (!item || isChecked) return;
    setProgress(p => ({ ...p, answers: { ...p.answers, [item.n]: letter } }));
  };
  const check = () => {
    if (!item) return;
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

  if (examQ.isLoading || !item) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {examQ.error ? (
          <div className="text-sm">
            Série indisponible : {examQ.error.message}{" "}
            <button className="underline" onClick={() => switchExam(DEFAULT_EXAM)}>
              revenir à la série Romaintalk
            </button>
          </div>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin" />
        )}
      </div>
    );
  }

  const media = mediaRef.current.get(`${examId}:${item.n}`);
  void mediaTick;
  const transcriptShown = !!transcriptOpen[item.n];
  const revealChoiceText = !item.spokenChoices || isChecked || transcriptShown;
  const explanation = explanations[item.n];
  const transcriptLines: { label: string | null; text: string }[] = item.audio
    ? item.audio.map(seg => ({ label: SPEAKER_LABEL[seg.speaker as Speaker], text: seg.text }))
    : (item.transcript ?? "")
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(text => ({ label: null, text }));

  const hasDoc = item.hasImage || !!item.passage;

  // Navigator button tone — shared by the right sidebar and the mobile strip.
  const navClass = (it: (typeof items)[number]) => {
    const a = answers[it.n];
    const c = checkedSet.has(it.n);
    const state = c ? (a === it.answer ? "right" : "wrong") : a ? "answered" : "blank";
    const current = it.n === item.n && !showResults;
    return cn(
      "h-8 min-w-8 rounded-md border text-xs font-semibold tabular-nums transition-colors",
      current && "border-amber-600 bg-amber-600 text-white",
      !current && state === "right" && "border-emerald-500/60 bg-emerald-500/10 text-emerald-800",
      !current && state === "wrong" && "border-red-500/60 bg-red-500/10 text-red-800",
      !current && state === "answered" && "border-foreground/40 bg-muted text-foreground",
      !current && state === "blank" && "border-border text-muted-foreground hover:bg-muted"
    );
  };

  const toolBtn = (active = false) =>
    cn(
      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40",
      active ? "border-amber-600 bg-amber-500/10 text-amber-800" : "border-border bg-transparent hover:border-amber-500/60 hover:bg-amber-500/5"
    );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── top bar ── */}
      <header className="flex min-h-14 flex-shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-sm md:gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[10px] font-bold uppercase tracking-wider text-amber-700">Test Mock · admin</div>
          <h1 className="truncate font-display text-base font-bold leading-tight md:text-lg">{title}</h1>
        </div>
        <select
          value={examId}
          onChange={e => switchExam(e.target.value)}
          className="max-w-[11rem] truncate rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm font-semibold focus:outline-none focus:border-amber-600 md:max-w-none"
          title="Série"
        >
          {(examsQ.data?.exams ?? [{ id: examId, title: title || examId, source: "romaintalk", itemCount: 40 }]).map(e => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <span className="hidden font-display text-[11px] font-bold uppercase tracking-wider tabular-nums text-muted-foreground sm:inline">
          {score.answered}/{score.total} répondues
        </span>
        <button onClick={() => setShowResults(s => !s)} className={toolBtn(showResults)} title="Résultats">
          <Trophy className="h-4 w-4" /> <span className="hidden md:inline">Résultats</span>
        </button>
        <button onClick={reset} title="Recommencer la série" className={cn(toolBtn(), "hover:border-red-400/60 hover:bg-red-500/5")}>
          <RotateCcw className="h-4 w-4" /> <span className="hidden md:inline">Recommencer</span>
        </button>
      </header>

      {/* mobile navigator strip */}
      <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
        {items.map(it => (
          <button key={it.n} onClick={() => go(it.n)} className={cn(navClass(it), "px-2")}>
            {it.n}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── main ── */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {showResults ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ResultsCard score={score} items={items} answers={answers} onGo={go} />
            </div>
          ) : (
            <>
              {/* item strip: number · section · consigne */}
              <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-background/50 px-4 py-2">
                <span className="font-display text-sm font-bold tabular-nums">
                  Question {item.n}
                  <span className="text-muted-foreground">/{items.length}</span>
                </span>
                <span className="h-4 w-px bg-border" />
                <span className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{TCF_SECTION_META[item.section].label}</span>
                {item.level && (
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground" title="Niveau visé">
                    {item.level}
                  </span>
                )}
                <p className="min-w-0 basis-full text-sm text-foreground/90 md:ml-auto md:basis-auto md:text-right">{item.consigne}</p>
              </div>

              {/* document zone: picture / passage left, question + panels right */}
              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                {hasDoc && (
                  <section className="flex max-h-[38%] flex-shrink-0 flex-col border-b border-border md:max-h-none md:w-[52%] md:border-b-0 md:border-r">
                    {item.hasImage ? (
                      <div className="flex min-h-0 flex-1 items-center justify-center p-3 md:p-4">
                        {media?.imageUrl ? (
                          <img src={media.imageUrl} alt="Document" className="max-h-full max-w-full rounded-md border border-border object-contain" />
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto p-4 font-serif text-[15px] leading-relaxed whitespace-pre-line md:p-5">{item.passage}</div>
                    )}
                  </section>
                )}

                <section className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {item.hasAudio && (
                    <div className="flex items-center gap-3 border-b border-border pb-3">
                      <button
                        onClick={() => (audioState === "idle" ? playItem(item.n) : stopAudio())}
                        className={cn(
                          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-white transition-colors",
                          audioState === "idle" ? "bg-amber-600 hover:bg-amber-600/90" : "bg-neutral-700 hover:bg-neutral-700/90"
                        )}
                        title={audioState === "idle" ? "Écouter" : "Arrêter"}
                      >
                        {audioState === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : audioState === "playing" ? (
                          <Square className="h-3.5 w-3.5" fill="currentColor" />
                        ) : (
                          <Play className="h-4 w-4" fill="currentColor" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-semibold">
                          {audioState === "loading" && "Préparation de l'audio…"}
                          {audioState === "playing" &&
                            (item.audio && turnIdx >= 0
                              ? `${SPEAKER_LABEL[item.audio[turnIdx]?.speaker as Speaker] ?? ""} · tour ${turnIdx + 1}/${item.audio.length}`
                              : "Lecture…")}
                          {audioState === "idle" && "Document sonore"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.audio ? `${item.audio.length} tours de parole · le document, puis la question.` : "Le document se joue une seule fois dans le vrai test."}
                        </div>
                      </div>
                    </div>
                  )}

                  {item.question && <p className="text-base font-semibold leading-snug md:text-lg">{item.question}</p>}

                  {isChecked && (
                    <div className={cn("border-l-2 pl-3 text-sm", chosen === item.answer ? "border-emerald-600" : "border-red-600")}>
                      <div className="font-semibold">{chosen === item.answer ? "Bonne réponse !" : `Mauvaise réponse — la bonne réponse est ${item.answer}.`}</div>
                      {item.note && <div className="mt-1 text-muted-foreground">{item.note}</div>}
                    </div>
                  )}

                  {transcriptShown && transcriptLines.length > 0 && (
                    <div className="rounded-lg border border-border p-3 text-sm leading-relaxed">
                      <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Transcription</div>
                      <div className="space-y-1.5">
                        {transcriptLines.map((line, i) => (
                          <p key={i} className={cn(item.audio && i === turnIdx && audioState === "playing" && "font-medium text-amber-800")}>
                            {line.label && <span className="mr-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{line.label}</span>}
                            {line.text}
                          </p>
                        ))}
                      </div>
                      {source === "tv5" && <p className="pt-2 text-xs text-muted-foreground">Transcription automatique — peut contenir de petites erreurs.</p>}
                    </div>
                  )}

                  {explanation && (
                    <div className="rounded-lg border border-amber-500/50 p-3">
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
                </section>
              </div>

              {/* choices — bottom, like the TCF IRN screen */}
              <div className="grid max-h-[40%] flex-shrink-0 gap-2 overflow-y-auto border-t border-border p-3 sm:grid-cols-2 md:px-4">
                {LETTERS.map((letter, i) => {
                  const raw = item.choices[i] ?? "";
                  const text = revealChoiceText && raw.trim() ? raw : `Réponse ${letter}`;
                  const isChosen = chosen === letter;
                  const isRight = item.answer === letter;
                  const tone = isChecked
                    ? isRight
                      ? "border-emerald-600 bg-emerald-500/10"
                      : isChosen
                        ? "border-red-600 bg-red-500/10"
                        : "border-border opacity-60"
                    : isChosen
                      ? "border-amber-600 bg-amber-500/10"
                      : "border-border hover:border-amber-500/60 hover:bg-amber-500/5";
                  const badge =
                    isChecked && isRight
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : isChecked && isChosen
                        ? "border-red-600 bg-red-600 text-white"
                        : isChosen
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-border text-foreground";
                  return (
                    <button
                      key={letter}
                      onClick={() => choose(letter)}
                      disabled={isChecked}
                      className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default", tone)}
                    >
                      <span className={cn("mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-xs font-bold", badge)}>
                        {isChecked && isRight ? <Check className="h-3.5 w-3.5" /> : isChecked && isChosen ? <X className="h-3.5 w-3.5" /> : letter}
                      </span>
                      <span className="leading-snug">{text}</span>
                    </button>
                  );
                })}
              </div>

              {/* action bar */}
              <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-3 py-2 md:px-4">
                <button onClick={() => go(item.n - 1)} disabled={item.n <= 1} className={toolBtn()}>
                  <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Précédente</span>
                </button>
                <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={check}
                    disabled={isChecked}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600/90 disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" /> Vérifier
                  </button>
                  {transcriptLines.length > 0 && (
                    <button onClick={() => setTranscriptOpen(t => ({ ...t, [item.n]: !t[item.n] }))} className={toolBtn(transcriptShown)}>
                      <FileText className="h-4 w-4" /> Transcription
                    </button>
                  )}
                  <button onClick={() => explain(false)} disabled={explainMut.isPending} className={toolBtn(!!explanation)}>
                    {explainMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Expliquer (IA)
                  </button>
                </div>
                <button onClick={() => (item.n >= items.length ? setShowResults(true) : go(item.n + 1))} className={toolBtn()}>
                  <span className="hidden sm:inline">{item.n >= items.length ? "Terminer" : "Suivante"}</span> <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </main>

        {/* ── right navigator ── */}
        <aside className="hidden min-h-0 w-60 flex-shrink-0 flex-col overflow-y-auto border-l border-border bg-background/50 md:flex">
          {SECTIONS.map(sec => {
            const group = items.filter(it => it.section === sec);
            if (group.length === 0) return null;
            const s = score.per[sec];
            return (
              <div key={sec} className="border-b border-border">
                <div className="flex items-center justify-between px-3 py-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span title={TCF_SECTION_META[sec].label}>
                    {SECTION_SHORT[sec]} <span className="font-normal normal-case tracking-normal">· {TCF_SECTION_META[sec].label}</span>
                  </span>
                  <span className="tabular-nums">
                    {s.right}/{s.total}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 px-3 pb-3">
                  {group.map(it => (
                    <button key={it.n} onClick={() => go(it.n)} className={navClass(it)}>
                      {it.n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="mt-auto space-y-1 px-3 py-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-foreground/40 bg-muted" /> répondue</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-emerald-500/60 bg-emerald-500/10" /> juste</div>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-red-500/60 bg-red-500/10" /> fausse</div>
          </div>
        </aside>
      </div>
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
  items: { n: number; section: TcfSection; answer: TcfLetter }[];
  answers: Record<number, TcfLetter>;
  onGo: (n: number) => void;
}) {
  const wrong = items.filter(it => answers[it.n] && answers[it.n] !== it.answer);
  const blank = items.filter(it => !answers[it.n]);
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
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
            <div key={sec} className="rounded-lg border border-border p-3">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{TCF_SECTION_META[sec].label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {s.right}
                <span className="text-sm text-muted-foreground">/{s.total}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden bg-muted">
                <div className="h-full bg-amber-600" style={{ width: `${pct}%` }} />
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
              <button key={it.n} onClick={() => onGo(it.n)} className="rounded-md border border-red-500/60 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-500/20">
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
              <button key={it.n} onClick={() => onGo(it.n)} className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-muted">
                {it.n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
