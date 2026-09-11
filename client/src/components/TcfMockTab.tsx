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
  Plus,
  Sparkles,
  Square,
  Trophy,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";
import { SPEAKER_LABEL, TCF_SECTION_META, type TcfLetter, type TcfSection } from "@shared/tcfMockExams";

const LETTERS: TcfLetter[] = ["A", "B", "C", "D"];
const SECTIONS: TcfSection[] = ["oral", "structure", "ecrit"];
const SECTION_SHORT: Record<TcfSection, string> = { oral: "CO", structure: "SL", ecrit: "CE" };
const DEFAULT_EXAM = "tv5-1";
// Version the selection preference so existing users start on TV5MONDE once.
// Per-exam answer storage remains unchanged.
const EXAM_PREFERENCE = "rt-tcf-mock:exam:v2";
const seriesTitle = (exam: { id: string; title: string; source: string }) =>
  exam.source === "tv5" ? `TV5MONDE — Livret d’entrainement n°${exam.id.replace("tv5-", "")}` : exam.title;
const HOVER_CARD_H = 170;
/** Structural lines: charcoal, not the pale-blue border token — burgundy stays for actions. */
const LINE = "border-foreground/25";

type GlossToken = { s: number; e: number; surface: string; lemma?: string; gloss: string; kind: "word" | "expression" };
type GlossLine = { text: string; tokens: GlossToken[] };

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
      return localStorage.getItem(EXAM_PREFERENCE) || DEFAULT_EXAM;
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
      localStorage.setItem(EXAM_PREFERENCE, id);
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

  // ── glossed transcript (Listening-Lab style hover card) ──
  const transcriptShown = !!item && !!transcriptOpen[item.n];
  const hasTranscript = !!item && (!!item.audio?.length || !!item.transcript?.trim());
  const glossQ = trpc.tcf.gloss.useQuery(
    { examId, n: item?.n ?? 1 },
    { enabled: !!item && transcriptShown && hasTranscript, staleTime: Infinity, trpc: { context: { skipBatch: true } } }
  );
  const { speak, state: pronounceState, activeText } = usePronounce();
  const [hover, setHover] = useState<{ token: GlossToken; top: number; left: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const cancelHoverClose = useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);
  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverTimer.current = window.setTimeout(() => setHover(null), 160);
  }, [cancelHoverClose]);
  useEffect(() => cancelHoverClose, [cancelHoverClose]);
  const openHover = useCallback(
    (token: GlossToken, el: HTMLElement) => {
      cancelHoverClose();
      const r = el.getBoundingClientRect();
      const below = r.bottom + 8;
      const flip = below + HOVER_CARD_H > window.innerHeight;
      setHover({ token, top: flip ? Math.max(8, r.top - HOVER_CARD_H - 8) : below, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) });
    },
    [cancelHoverClose]
  );
  const utils = trpc.useUtils();
  const addVocab = trpc.vocab.add.useMutation();
  const { data: allVocab = [] } = trpc.vocab.list.useQuery();
  const savedTerms = useMemo(() => new Set(allVocab.map(w => w.term.toLowerCase())), [allVocab]);
  const saveToken = async (token: GlossToken) => {
    if (savedTerms.has(token.surface.toLowerCase())) return;
    try {
      await addVocab.mutateAsync({
        term: token.surface,
        translation: token.gloss || token.surface,
        entryKind: token.surface.trim().split(/\s+/).length >= 3 ? "phrase" : "word",
        lessonSource: title || "TCF Blanc",
      });
      utils.vocab.list.invalidate();
      toast.success(`Saved "${token.surface}"`);
    } catch {
      toast.error("Failed to save");
    }
  };

  // Keep the current question visible in the navigator list.
  const asideRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    asideRef.current?.querySelector('[data-current="1"]')?.scrollIntoView({ block: "nearest" });
  }, [n]);

  if (examQ.isLoading || !item) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        {examQ.error ? (
          <div className="text-sm">
            Série indisponible : {examQ.error.message}{" "}
            <button className="underline" onClick={() => switchExam("romaintalk-1")}>
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
  const glossLines: GlossLine[] | null = glossQ.data?.lines?.length ? (glossQ.data.lines as GlossLine[]) : null;
  const isSavedHover = hover ? savedTerms.has(hover.token.surface.toLowerCase()) : false;

  const navState = (it: (typeof items)[number]) => {
    const a = answers[it.n];
    const c = checkedSet.has(it.n);
    return c ? (a === it.answer ? "right" : "wrong") : a ? "answered" : "blank";
  };

  // Compact number chip — used by the mobile strip.
  const chipClass = (it: (typeof items)[number]) => {
    const state = navState(it);
    const current = it.n === item.n && !showResults;
    return cn(
      "h-8 min-w-8 rounded-md border px-2 text-xs font-semibold tabular-nums transition-colors",
      current && "border-speaking bg-speaking text-speaking-foreground",
      !current && state === "right" && "border-emerald-600 text-emerald-800",
      !current && state === "wrong" && "border-red-600 text-red-800",
      !current && state === "answered" && "border-foreground/50 text-foreground",
      !current && state === "blank" && `${LINE} text-muted-foreground hover:bg-muted`
    );
  };

  const toolBtn = (active = false) =>
    cn(
      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40",
      active ? "border-speaking bg-speaking-surface text-speaking" : `${LINE} bg-transparent hover:border-speaking hover:bg-speaking-surface/50`
    );
  const primaryBtn =
    "flex items-center gap-1.5 rounded-lg border border-speaking bg-speaking px-4 py-1.5 text-sm font-semibold text-speaking-foreground transition-colors hover:bg-speaking/90 disabled:opacity-40";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── top bar ── */}
      <header className={cn("flex min-h-14 flex-shrink-0 items-center gap-2 border-b bg-background/80 px-4 py-2 backdrop-blur-sm md:gap-3", LINE)}>
        <h1 className="flex min-w-0 flex-1 items-center gap-3" aria-label={source === "tv5" ? "TCF — TV5MONDE" : `TCF — ${title}`}>
          <img src="/tcf/tcf-logo.png" alt="TCF — France Éducation international" className="h-8 w-auto shrink-0" />
          {source === "tv5" ? <img src="/tcf/tv5monde-logo.svg" alt="TV5MONDE" className="h-5 w-auto min-w-0 max-w-36" /> : <span className="truncate font-display text-lg font-bold">RomainTalk</span>}
        </h1>
        <select
          value={examId}
          onChange={e => switchExam(e.target.value)}
          className={cn("max-w-[11rem] truncate rounded-lg border bg-transparent px-2 py-1.5 text-sm font-semibold focus:border-speaking focus:outline-none md:max-w-none", LINE)}
          title="Série"
        >
          {(examsQ.data?.exams ?? [{ id: examId, title: title || examId, source: "romaintalk", itemCount: 40 }]).map(e => (
            <option key={e.id} value={e.id}>
              {seriesTitle(e)}
            </option>
          ))}
        </select>
        <button onClick={() => setShowResults(s => !s)} className={toolBtn(showResults)} title="Résultats">
          <Trophy className="h-4 w-4" /> <span className="hidden md:inline">Résultats</span>
        </button>
        <button onClick={reset} title="Recommencer la série" className={cn(toolBtn(), "hover:border-red-600 hover:bg-red-500/5")}>
          <RotateCcw className="h-4 w-4" /> <span className="hidden md:inline">Recommencer</span>
        </button>
        <span className="ml-1 font-display text-base font-bold tabular-nums md:text-lg">
          {score.answered}
          <span className="text-muted-foreground">/{score.total}</span>
          <span className="ml-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">répondues</span>
        </span>
      </header>

      {/* mobile navigator strip */}
      <div className={cn("flex flex-shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 md:hidden", LINE)}>
        {items.map(it => (
          <button key={it.n} onClick={() => go(it.n)} className={chipClass(it)}>
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
              <div className={cn("flex-shrink-0 space-y-1 border-b bg-background/50 px-4 py-2", LINE)}>
                <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-1">
                <span className="font-display text-sm font-bold tabular-nums">
                  Question {item.n}
                  <span className="text-muted-foreground">/{items.length}</span>
                </span>
                <span className="h-4 w-px bg-foreground/25" />
                <span className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{TCF_SECTION_META[item.section].label}</span>
                {item.level && (
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground", LINE)} title="Niveau visé">
                    {item.level}
                  </span>
                )}
                </div>
                <p className="w-full min-w-0 text-left text-sm text-foreground/90">{item.consigne}</p>
              </div>

              {/* document zone: picture / passage left, question + panels right */}
              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                {hasDoc && (
                  <section className={cn("flex max-h-[38%] flex-shrink-0 flex-col border-b md:max-h-none md:w-[52%] md:border-b-0 md:border-r", LINE)}>
                    {item.hasImage ? (
                      <div className="flex min-h-0 flex-1 items-start justify-center p-3 md:p-4">
                        {media?.imageUrl ? (
                          <img src={media.imageUrl} alt="Document" className="h-full w-full min-h-0 min-w-0 object-contain object-top" />
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
                    <div className={cn("flex items-center gap-3 border-b pb-3", LINE)}>
                      <button
                        onClick={() => (audioState === "idle" ? playItem(item.n) : stopAudio())}
                        className={cn(
                          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
                          audioState === "idle" ? "bg-speaking text-speaking-foreground hover:bg-speaking/90" : "bg-foreground text-background hover:bg-foreground/90"
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

                  {item.section === "oral" && !item.hasAudio && (
                    <p className="text-xs text-muted-foreground">Document sonore pas encore importé pour cette série (podcast manquant).</p>
                  )}
                  {item.question && <p className="text-base font-semibold leading-snug md:text-lg">{item.question}</p>}

                  {isChecked && (
                    <div className={cn("border-l-2 pl-3 text-sm", chosen === item.answer ? "border-emerald-600" : "border-red-600")}>
                      <div className="font-semibold">{chosen === item.answer ? "Bonne réponse !" : `Mauvaise réponse — la bonne réponse est ${item.answer}.`}</div>
                      {item.note && <div className="mt-1 text-muted-foreground">{item.note}</div>}
                    </div>
                  )}

                  {transcriptShown && transcriptLines.length > 0 && (
                    <div className={cn("rounded-lg border p-3 text-sm leading-[1.85]", LINE)}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Transcription</span>
                        {glossQ.isFetching && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> glossaire…
                          </span>
                        )}
                        {glossQ.isError && <span className="text-[11px] text-red-700">glossaire indisponible</span>}
                      </div>
                      <div className="space-y-1.5">
                        {transcriptLines.map((line, i) => (
                          <p key={i} className={cn(item.audio && i === turnIdx && audioState === "playing" && "font-medium text-speaking")}>
                            {line.label && <span className="mr-2 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{line.label}</span>}
                            {glossLines?.[i] && glossLines[i].text === line.text ? (
                              <GlossedLine line={glossLines[i]} onHover={openHover} onLeave={scheduleHoverClose} />
                            ) : (
                              line.text
                            )}
                          </p>
                        ))}
                      </div>
                      {source === "tv5" && <p className="pt-2 text-xs text-muted-foreground">Transcription automatique — peut contenir de petites erreurs.</p>}
                    </div>
                  )}

                  {explanation && (
                    <div className="rounded-lg border border-speaking/50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-speaking">
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
              <div className={cn("grid max-h-[40%] flex-shrink-0 gap-2 overflow-y-auto border-t p-3 sm:grid-cols-2 md:px-4", LINE)}>
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
                        : `${LINE} opacity-60`
                    : isChosen
                      ? "border-speaking bg-speaking-surface"
                      : `${LINE} hover:border-speaking hover:bg-speaking-surface/50`;
                  const badge =
                    isChecked && isRight
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : isChecked && isChosen
                        ? "border-red-600 bg-red-600 text-white"
                        : isChosen
                          ? "border-speaking bg-speaking text-speaking-foreground"
                          : `${LINE} text-foreground`;
                  return (
                    <button
                      key={letter}
                      onClick={() => choose(letter)}
                      disabled={isChecked}
                      className={cn("flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default", tone)}
                    >
                      <span className={cn("flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border text-xs font-bold", badge)}>
                        {isChecked && isRight ? <Check className="h-3.5 w-3.5" /> : isChecked && isChosen ? <X className="h-3.5 w-3.5" /> : letter}
                      </span>
                      <span className="leading-snug">{text}</span>
                    </button>
                  );
                })}
              </div>

              {/* action bar */}
              <div className={cn("flex flex-shrink-0 items-center gap-2 border-t px-3 py-2 md:px-4", LINE)}>
                <button onClick={() => go(item.n - 1)} disabled={item.n <= 1} className={toolBtn()}>
                  <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">Précédente</span>
                </button>
                <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
                  <button onClick={check} disabled={isChecked} className={primaryBtn}>
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

        {/* ── right navigator: one question per row ── */}
        <aside ref={asideRef} className={cn("hidden min-h-0 w-44 flex-shrink-0 flex-col overflow-y-auto border-l bg-background/50 md:flex", LINE)}>
          {SECTIONS.map(sec => {
            const group = items.filter(it => it.section === sec);
            if (group.length === 0) return null;
            const s = score.per[sec];
            return (
              <div key={sec}>
                <div className={cn("sticky top-0 z-10 flex items-center justify-between border-b bg-background px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-muted-foreground", LINE)}>
                  <span className="min-w-0 truncate" title={TCF_SECTION_META[sec].label}>
                    {SECTION_SHORT[sec]} <span className="font-normal normal-case tracking-normal">· {TCF_SECTION_META[sec].label}</span>
                  </span>
                  <span className="ml-2 flex-shrink-0 tabular-nums">
                    {s.right}/{s.total}
                  </span>
                </div>
                {group.map(it => {
                  const state = navState(it);
                  const current = it.n === item.n && !showResults;
                  return (
                    <button
                      key={it.n}
                      data-current={current ? "1" : undefined}
                      onClick={() => go(it.n)}
                      className={cn(
                        "flex h-8 w-full items-center gap-2 border-b border-foreground/10 px-3 text-left text-xs transition-colors",
                        current ? "bg-speaking text-speaking-foreground" : "hover:bg-muted"
                      )}
                    >
                      <span className="w-6 font-display font-bold tabular-nums">{it.n}</span>
                      <span className={cn("flex-1 truncate", !current && "text-muted-foreground")}>
                        {state === "blank" ? "—" : `Réponse ${answers[it.n]}`}
                      </span>
                      {state === "right" && <Check className={cn("h-3.5 w-3.5", !current && "text-emerald-700")} />}
                      {state === "wrong" && <X className={cn("h-3.5 w-3.5", !current && "text-red-700")} />}
                      {state === "answered" && <span className={cn("h-2 w-2 rounded-full", current ? "bg-speaking-foreground" : "bg-foreground/60")} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>
      </div>

      {hover && (
        <div
          style={{ top: hover.top, left: hover.left }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          className="fixed z-50 w-64 rounded-2xl bg-popover p-3 shadow-[0_12px_32px_-8px_rgb(23_63_107_/_0.35)] ring-1 ring-black/5"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold text-foreground">{hover.token.surface}</p>
              {hover.token.lemma && <p className="text-xs italic text-muted-foreground">{hover.token.lemma}</p>}
            </div>
            <PronounceButton
              text={hover.token.surface}
              speak={speak}
              state={pronounceState}
              activeText={activeText}
              className="flex-shrink-0 bg-primary/15 p-1.5 text-primary hover:bg-primary/25"
              iconSize="w-3.5 h-3.5"
            />
          </div>
          <p className="mt-1.5 text-sm text-foreground">{hover.token.gloss || <span className="italic text-muted-foreground">no gloss</span>}</p>
          <button
            onClick={() => saveToken(hover.token)}
            disabled={isSavedHover}
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors",
              isSavedHover ? "bg-emerald-500/15 text-emerald-700" : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isSavedHover ? (
              <>
                <Check className="h-3.5 w-3.5" /> Saved
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Save to library
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** One transcript line with each token underlined and hoverable (same look as Reading / Listening). */
function GlossedLine({ line, onHover, onLeave }: { line: GlossLine; onHover: (t: GlossToken, el: HTMLElement) => void; onLeave: () => void }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  line.tokens.forEach(t => {
    if (t.s > at) parts.push(<span key={`gap-${at}`}>{line.text.slice(at, t.s)}</span>);
    parts.push(
      <span
        key={`tok-${t.s}`}
        onMouseEnter={e => onHover(t, e.currentTarget)}
        onMouseLeave={onLeave}
        className={cn(
          "cursor-help transition-colors",
          t.kind === "expression" ? "border-b-2 border-dashed border-speaking/60 hover:bg-speaking-surface" : "border-b border-dashed border-muted-foreground/40 hover:bg-primary/10"
        )}
      >
        {line.text.slice(t.s, t.e)}
      </span>
    );
    at = t.e;
  });
  if (at < line.text.length) parts.push(<span key="tail">{line.text.slice(at)}</span>);
  return <>{parts}</>;
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
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-foreground/25 pb-4">
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
            <div key={sec} className="rounded-lg border border-foreground/25 p-3">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{TCF_SECTION_META[sec].label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {s.right}
                <span className="text-sm text-muted-foreground">/{s.total}</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden bg-muted">
                <div className="h-full bg-speaking" style={{ width: `${pct}%` }} />
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
              <button key={it.n} onClick={() => onGo(it.n)} className="rounded-md border border-foreground/25 px-2.5 py-1 text-xs font-semibold hover:bg-muted">
                {it.n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
