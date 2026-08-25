/**
 * MarcExamTab — TCF mock oral exam with Marc, an ElevenLabs workflow agent.
 *
 * Marc's exam structure (opening → 3 tasks → feedback) is enforced by an
 * ElevenLabs workflow graph on the agent itself, so this tab is deliberately
 * lean compared to AnnaVoiceTab: no vocab tools, no language-mix settings, no
 * memory injection — an exam is a standalone, self-contained session.
 *
 * Task 2 hands the candidate a printed sujet in the real exam. Marc puts that
 * document on screen by calling the `afficher_sujet` client tool, which the
 * workflow forces on entry to its task2_setup node; the transcript regexes below
 * are only a net under that call, so a missed tool call still shows the sheet and
 * Task 3 always clears it.
 *
 * There is intentionally NO pause control. The SDK has no pause primitive, and
 * the Anna-style workaround (end the session, reconnect with a fresh signed
 * URL) would restart the workflow from the opening node — in exam terms,
 * tearing up the paper halfway through. One sitting, then feedback.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Conversation, type VoiceConversation } from "@elevenlabs/client";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { avatarLayoutId } from "@/components/AvatarVideo";
import { idleContainer, idleItem } from "@/components/idleReveal";
import { resolveTask2Sujet, DEFAULT_TASK2_SUJET, type Task2Sujet } from "@/lib/tcfSujets";
import { PHASE_ENTRIES, type ExamPhase } from "@/lib/tcfPhases";
import {
  Mic,
  PhoneOff,
  Loader2,
  Volume2,
  ClipboardCheck,
  MessageSquare,
  FileText,
  X,
} from "lucide-react";

interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  id?: string;
}

type SessionState = "idle" | "connecting" | "active" | "ending" | "ended";

/** Marc has no avatar video yet — a gradient monogram stands in. */
export function MarcAvatar({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 bg-gradient-to-br from-amber-500/30 to-amber-500/5", className)}>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl md:text-6xl font-bold text-amber-700/70 select-none">M</span>
      </div>
    </div>
  );
}

function Waveform({ active, color }: { active: boolean; color: string }) {
  const bars = 20;
  return (
    <div className="flex items-center justify-center gap-0.5 h-8">
      <style>{`
        @keyframes marc-wave {
          from { height: 20%; }
          to { height: 90%; }
        }
      `}</style>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-full"
          style={{
            backgroundColor: color,
            height: "20%",
            opacity: active ? 0.8 : 0.3,
            transition: "opacity 0.15s",
            animationName: active ? "marc-wave" : "none",
            animationDuration: `${0.5 + (i % 5) * 0.1}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}

/** The Task 2 document, alongside the exam rather than interrupting it. */
function SujetPanel({ sujet, onZoom }: { sujet: Task2Sujet; onZoom: () => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex-shrink-0 flex flex-col min-h-0 border-b border-border lg:w-[42%] lg:max-w-md lg:border-b-0 lg:border-r"
    >
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {sujet.label}
          </p>
          <button
            type="button"
            onClick={onZoom}
            className="text-[11px] font-medium text-muted-foreground hover:text-amber-700 transition-colors"
          >
            Agrandir
          </button>
        </div>
        <p className="mt-1 text-sm text-foreground leading-relaxed">{sujet.consigne}</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 max-h-[40vh] lg:max-h-none">
        <button
          type="button"
          onClick={onZoom}
          title="Agrandir le document"
          className="block w-full rounded-xl overflow-hidden border border-border bg-white transition-colors hover:border-amber-500/60"
        >
          <img src={sujet.image} alt={sujet.alt} className="w-full h-auto" />
        </button>
      </div>
    </motion.aside>
  );
}

/** Full-size document. Portalled — transformed ancestors would trap a fixed child. */
function SujetLightbox({ sujet, onClose }: { sujet: Task2Sujet; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={sujet.label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <img
        src={sujet.image}
        alt={sujet.alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-auto max-w-3xl rounded-lg bg-white shadow-2xl"
      />
      <button
        onClick={onClose}
        aria-label="Fermer le document"
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>
    </div>,
    document.body,
  );
}

export function MarcExamTab() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [endedSummary, setEndedSummary] = useState<string | null>(null);
  const [sujet, setSujet] = useState<Task2Sujet | null>(null);
  const [sujetZoomed, setSujetZoomed] = useState(false);

  const conversationRef = useRef<VoiceConversation | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const aiStreamIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);

  const createSessionMutation = trpc.voiceSession.create.useMutation();
  const endSessionMutation = trpc.voiceSession.end.useMutation();
  const marcSignedUrlMutation = trpc.voice.marcSignedUrl.useMutation();

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const cleanup = useCallback(() => {
    if (conversationRef.current) {
      conversationRef.current.endSession().catch(() => {});
      conversationRef.current = null;
    }
  }, []);

  // Tear down the live connection if the tab unmounts so Marc stops talking.
  useEffect(() => cleanup, [cleanup]);

  const startExam = async (phase: ExamPhase = "complet") => {
    const entry = PHASE_ENTRIES.find((p) => p.id === phase);
    try {
      setSessionState("connecting");
      setTranscript([]);
      setEndedSummary(null);
      // A jump lands mid-workflow, so its document goes up with the opener
      // rather than waiting on the tool call Marc makes in a full sitting.
      setSujet(entry?.sujet ?? null);
      setSujetZoomed(false);
      aiStreamIdRef.current = null;
      endingRef.current = false;

      const { id } = await createSessionMutation.mutateAsync();
      setSessionId(id);

      const { signedUrl } = await marcSignedUrlMutation.mutateAsync();

      const conversation = await Conversation.startSession({
        signedUrl,

        // Read by the expression edges on the workflow's start node.
        dynamicVariables: { phase_depart: phase },

        // Only ever sent on a jump — a full exam keeps the agent's own opening.
        ...(entry ? { overrides: { agent: { firstMessage: entry.firstMessage } } } : {}),

        clientTools: {
          // Forced on entry to the task2_setup node — Marc cannot start Task 2
          // without it, so this is the authoritative "show the sheet" signal.
          afficher_sujet: ({ sujet_id }: { sujet_id?: string }) => {
            const next = resolveTask2Sujet(sujet_id);
            if (next) setSujet(next);
          },
        },

        onConnect: () => setSessionState("active"),

        onDisconnect: () => {
          // Marc's exam can end from the agent side (workflow completion);
          // treat any disconnect during a live exam as the end of the sitting.
          setSessionState((prev) => (prev === "active" ? "ending" : prev));
        },

        onError: (error) => {
          console.error("[Marc] ElevenLabs error:", error);
          toast.error("Connection error with Marc");
        },

        onModeChange: ({ mode }) => {
          setAiSpeaking(mode === "speaking");
          setUserSpeaking(mode === "listening");
          if (mode === "listening") aiStreamIdRef.current = null;
        },

        onMessage: ({ message, source }) => {
          const text = (message ?? "").trim();
          if (!text) return;
          if (source === "ai") {
            // Marc's phase scripts are verbatim, so they double as a fallback.
            // Order matters: the Task 3 opener names both tasks in one breath
            // ("la fin de la deuxième tâche… la troisième"), and it must hide.
            if (/troisi[eè]me\s+(et\s+derni[eè]re\s+)?t[aâ]che/i.test(text)) {
              setSujet(null);
              setSujetZoomed(false);
            } else if (/deuxi[eè]me\s+t[aâ]che/i.test(text)) {
              setSujet((prev) => prev ?? DEFAULT_TASK2_SUJET);
            }

            const lineId = aiStreamIdRef.current ?? `ai-${Date.now()}`;
            aiStreamIdRef.current = lineId;
            setTranscript((prev) => {
              const existing = prev.find((l) => l.id === lineId);
              if (existing) return prev.map((l) => (l.id === lineId ? { ...l, text } : l));
              return [...prev, { role: "assistant", text, timestamp: Date.now(), id: lineId }];
            });
          } else {
            setTranscript((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "user" && last.text === text) return prev;
              return [...prev, { role: "user", text, timestamp: Date.now(), id: `user-${Date.now()}` }];
            });
          }
        },
      });

      conversationRef.current = conversation as VoiceConversation;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start the exam with Marc");
      setSessionState("idle");
      cleanup();
    }
  };

  const endExam = async () => {
    if (endingRef.current || !sessionId) return;
    endingRef.current = true;
    setSessionState("ending");
    setSujet(null);
    setSujetZoomed(false);
    cleanup();
    try {
      const persistable = transcript.map((l) => ({ role: l.role, text: l.text, timestamp: l.timestamp }));
      const { summary } = await endSessionMutation.mutateAsync({
        sessionId,
        transcript: persistable,
        savedWords: [],
        agentName: "Marc",
      });
      setEndedSummary(summary);
      setSessionState("ended");
    } catch {
      toast.error("Failed to save the exam session");
      setSessionState("ended");
    }
  };
  const endExamRef = useRef(endExam);
  useEffect(() => { endExamRef.current = endExam; });

  // onDisconnect can push us into "ending" — persist through the same path.
  useEffect(() => {
    if (sessionState === "ending" && sessionId && !endingRef.current) {
      endExamRef.current();
    }
  }, [sessionState, sessionId]);

  const isLive = sessionState === "active";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Idle — exam briefing */}
        {sessionState === "idle" && (
          <div className="flex flex-col lg:flex-row items-center justify-center h-full min-h-[400px] p-6 gap-6 lg:gap-8">
            <div className="flex flex-col items-center text-center gap-5">
            <motion.div
              layoutId={avatarLayoutId("marc")}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-amber-500/40"
            >
              <MarcAvatar />
            </motion.div>

            <motion.div variants={idleContainer} initial="hidden" animate="show" className="flex flex-col items-center gap-5 w-full">
              <motion.div variants={idleItem}>
                <h2 className="font-display text-xl font-bold text-foreground mb-2">TCF Mock Oral Exam</h2>
                <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                  Marc is a TCF examiner. The exam has <span className="font-medium text-foreground">three tasks over ~10 minutes</span>:
                  a directed interview, a role-play where you ask the questions, and an argued opinion.
                  French only, one sitting — feedback comes at the end.
                </p>
              </motion.div>

              <motion.div variants={idleItem} className="w-full max-w-md">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-left space-y-1">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5" /> Exam conditions
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    There is no pause — like the real TCF, the exam runs start to finish.
                    You can ask Marc to repeat a question (<span className="italic">« Pouvez-vous répéter ? »</span>) without penalty.
                  </p>
                </div>
              </motion.div>

              <motion.div variants={idleItem}>
                <button
                  onClick={() => startExam()}
                  className="px-8 py-3 bg-amber-600 hover:bg-amber-600/90 text-white rounded-2xl font-semibold text-base transition-all shadow-lg shadow-amber-600/20 hover:shadow-amber-600/30"
                >
                  Start the Exam
                </button>
              </motion.div>
            </motion.div>
            </div>

            {/* Straight into one task — for drilling a phase without sitting
                the whole exam. The workflow still runs on from there. */}
            <motion.aside
              variants={idleContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col justify-center gap-2 w-full max-w-xs lg:w-52 lg:border-l lg:border-border lg:pl-6"
            >
              <motion.p variants={idleItem} className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Start from a task
              </motion.p>
              {PHASE_ENTRIES.map((entry) => (
                <motion.button
                  key={entry.id}
                  variants={idleItem}
                  onClick={() => startExam(entry.id)}
                  className="text-left px-3 py-2 rounded-xl border border-border bg-card hover:border-amber-500/60 hover:bg-amber-500/5 transition-colors"
                >
                  <span className="block text-sm font-semibold text-foreground">{entry.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{entry.blurb}</span>
                </motion.button>
              ))}
              <motion.p variants={idleItem} className="text-[11px] text-muted-foreground leading-relaxed">
                Skips the introduction and every earlier task. The exam runs on from there to the feedback.
              </motion.p>
            </motion.aside>
          </div>
        )}

        {/* Connecting */}
        {sessionState === "connecting" && (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
            <Loader2 className="w-10 h-10 text-amber-600 animate-spin" />
            <p className="text-sm text-muted-foreground">Connecting to the examiner…</p>
          </div>
        )}

        {/* Live exam */}
        {isLive && (
          <div className="flex flex-col h-full">
            <div className={cn("flex-1 min-h-0 flex", sujet ? "flex-col lg:flex-row" : "flex-col")}>
              {sujet && <SujetPanel sujet={sujet} onZoom={() => setSujetZoomed(true)} />}

              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-shrink-0 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className={cn("bg-card border rounded-xl p-3 transition-colors", userSpeaking ? "border-primary/60 bg-primary/5" : "border-border")}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Mic className="w-3 h-3" /> You
                      </p>
                      <Waveform active={userSpeaking} color="#173F6B" />
                    </div>
                    <div className={cn("bg-card border rounded-xl p-3 transition-colors", aiSpeaking ? "border-amber-500/60 bg-amber-500/5" : "border-border")}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Volume2 className="w-3 h-3" />
                        Marc {aiSpeaking && <span className="text-amber-700 animate-pulse">speaking…</span>}
                      </p>
                      <Waveform active={aiSpeaking} color="#9C6D18" />
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2 min-h-0">
                  {transcript.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-4">The exam will appear here…</p>
                  )}
                  {transcript.map((line, i) => (
                    <div key={line.id ?? i} className={cn("flex gap-2 items-start", line.role === "user" ? "flex-row-reverse" : "flex-row")}>
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5",
                        line.role === "user" ? "bg-secondary text-foreground" : "bg-amber-500/20 text-amber-700"
                      )}>
                        {line.role === "user" ? "Me" : "M"}
                      </div>
                      <div className={cn(
                        "max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed",
                        line.role === "user" ? "bg-secondary text-foreground rounded-tr-sm" : "bg-card card-float text-foreground rounded-tl-sm"
                      )}>
                        {line.text}
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-border px-4 py-4 flex items-center justify-center">
              <button
                onClick={endExam}
                className="flex flex-col items-center gap-1.5 px-8 py-3 bg-destructive/10 hover:bg-destructive/20 border border-destructive/40 text-destructive rounded-2xl font-semibold text-sm transition-all"
                title="End the exam"
              >
                <PhoneOff className="w-5 h-5" />
                <span className="text-xs">End Exam</span>
              </button>
            </div>
          </div>
        )}

        {/* Ending */}
        {sessionState === "ending" && (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
            <Loader2 className="w-10 h-10 text-amber-600 animate-spin" />
            <p className="text-sm text-muted-foreground">Saving your exam session…</p>
          </div>
        )}

        {/* Ended */}
        {sessionState === "ended" && (
          <div className="flex flex-col items-center p-6 gap-5 max-w-lg mx-auto w-full">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
              <ClipboardCheck className="w-6 h-6 text-amber-700" />
            </div>
            <h2 className="font-display text-lg font-bold text-foreground">Exam Complete</h2>

            {endedSummary && (
              <div className="w-full bg-card card-float rounded-xl p-4">
                <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Session Summary</p>
                <p className="text-sm text-foreground leading-relaxed">{endedSummary}</p>
              </div>
            )}

            {transcript.length > 0 && (
              <div className="w-full bg-card card-float rounded-xl p-4">
                <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Transcript ({transcript.length} lines)
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {transcript.map((line, i) => (
                    <p key={i} className={cn("text-xs", line.role === "user" ? "text-foreground" : "text-amber-700")}>
                      <span className="font-semibold">{line.role === "user" ? "You" : "Marc"}: </span>
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setSessionState("idle");
                setTranscript([]);
                setEndedSummary(null);
                setSessionId(null);
                aiStreamIdRef.current = null;
              }}
              className="px-8 py-3 bg-amber-600 hover:bg-amber-600/90 text-white rounded-2xl font-semibold transition-all"
            >
              New Exam
            </button>
          </div>
        )}
      </div>

      {sujetZoomed && sujet && (
        <SujetLightbox sujet={sujet} onClose={() => setSujetZoomed(false)} />
      )}
    </div>
  );
}
