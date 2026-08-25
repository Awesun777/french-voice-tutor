/**
 * VoiceAgentChooser — the entry screen for Voice Chat.
 *
 * Replaces the old top toggle-bar with a full-height split screen:
 *   LEFT half  = Romain (OpenAI Realtime)
 *   RIGHT half = Anna   (ElevenLabs)
 *
 * The entire half is clickable to *select* a tutor (it highlights and the
 * other half dims); a floating "Start" button then mounts that tutor's
 * session view. A slim "← Tutors" bar returns to the chooser (unmounting the
 * agent tab, which tears down its live voice connection).
 *
 * The Test Mock side (Marc) is admin-only — `voice.marcSignedUrl` is an
 * adminProcedure, so hiding the flip here just keeps a non-admin from walking
 * into a FORBIDDEN they cannot act on.
 *
 * Each half shows a looping avatar video with the tutor's name beneath it.
 * The avatar carries a shared `layoutId`, so when a tutor is started it morphs
 * (moves + shrinks) into the idle screen's avatar slot via framer-motion; the
 * whole flow is wrapped in a single <LayoutGroup> so that shared-element
 * transition survives the chooser⇄session mount swap.
 */

import { useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { ArrowLeft, Play, MessageCircle, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { AvatarVideo, avatarLayoutId } from "@/components/AvatarVideo";
import VoiceChatTab from "@/components/VoiceChatTab";
import { AnnaVoiceTab } from "@/components/AnnaVoiceTab";
import { MarcExamTab, MarcAvatar } from "@/components/MarcExamTab";

type VoiceAgent = "romain" | "anna" | "marc";
type SpeakingMode = "casual" | "test-mock";

type AgentConfig = {
  id: VoiceAgent;
  name: string;
  tag: string;
  /** Path under client/public. `null` renders the placeholder avatar. */
  video: string | null;
  /** Tailwind accent classes, keyed per side. */
  ring: string;
  glow: string;
  tint: string;
  button: string;
  placeholder: string;
};

const AGENTS: AgentConfig[] = [
  {
    id: "romain",
    name: "Romain",
    // Keep in sync with the realtime model in server/_core/index.ts.
    tag: "gpt-realtime-2.1 · OpenAI",
    video: "/avatars/romain.mp4",
    ring: "ring-primary",
    glow: "shadow-[0_0_60px_-12px] shadow-primary/50",
    tint: "from-primary/10",
    button: "bg-primary text-primary-foreground hover:bg-primary/90",
    placeholder: "from-primary/30 to-primary/5",
  },
  {
    id: "anna",
    name: "Anna",
    tag: "ElevenLabs",
    video: "/avatars/anna.mp4",
    ring: "ring-speaking",
    glow: "shadow-[0_0_60px_-12px] shadow-speaking/40",
    tint: "from-speaking/10",
    button: "bg-speaking text-speaking-foreground hover:bg-speaking/90",
    placeholder: "from-speaking/30 to-speaking/5",
  },
];

/**
 * Marc lives outside AGENTS: he belongs to the test-mock side of the flip, has
 * no select-then-start step (clicking him goes straight into the exam), and no
 * avatar video yet.
 */
const MARC = {
  id: "marc" as const,
  name: "Marc",
  tag: "TCF Examiner · ElevenLabs",
};

function AgentAvatar({ agent, active }: { agent: AgentConfig; active: boolean }) {
  const ringCls = cn(
    // transition-shadow (not transition-all) so the CSS transition only animates
    // the ring/glow color and never fights framer's transform-based layout morph.
    "relative h-36 w-36 md:h-56 md:w-56 rounded-full overflow-hidden ring-4 transition-shadow duration-300",
    active ? cn(agent.ring, agent.glow) : "ring-border",
  );

  return (
    <motion.div layoutId={avatarLayoutId(agent.id)} className={ringCls}>
      {agent.video ? (
        <AvatarVideo src={agent.video} />
      ) : (
        // Placeholder until a video is provided.
        <div className={cn("absolute inset-0 bg-gradient-to-br", agent.placeholder)}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl md:text-7xl font-bold text-speaking/70 animate-pulse select-none">
              {agent.name[0]}
            </span>
          </div>
          <span className="absolute bottom-3 left-0 right-0 text-center font-display text-[10px] uppercase tracking-wide text-muted-foreground">
            video coming soon
          </span>
        </div>
      )}
    </motion.div>
  );
}

function VoiceAgentChooser({ onStartReview }: { onStartReview: (dateKey?: string) => void }) {
  const [selected, setSelected] = useState<VoiceAgent | null>(null);
  const [started, setStarted] = useState<VoiceAgent | null>(null);
  const [mode, setMode] = useState<SpeakingMode>("casual");

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Marc is admin-only, so a non-admin never leaves the casual side — and can
  // never be left mounted in his tab if the role changes under them.
  const activeMode: SpeakingMode = isAdmin ? mode : "casual";
  const activeStarted = started === "marc" && !isAdmin ? null : started;

  const startedAgent = activeStarted
    ? (activeStarted === "marc" ? MARC : AGENTS.find((a) => a.id === activeStarted)!)
    : null;

  const flipTo = (m: SpeakingMode) => {
    setMode(m);
    setSelected(null);
  };

  return (
    // A single, persistent LayoutGroup spans both the chooser and the session
    // view so the avatar's shared-element morph survives the mount swap below.
    <LayoutGroup>
      {startedAgent ? (
        // ── In session: mount the chosen tutor's tab with a back affordance. ──
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0 h-14 border-b border-border bg-background/80 backdrop-blur-sm px-4 flex items-center gap-3">
            <button
              onClick={() => setStarted(null)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {activeStarted === "marc" ? "Speaking" : "Tutors"}
            </button>
            <span className="text-sm font-semibold">{startedAgent.name}</span>
            <span className="text-[10px] text-muted-foreground">{startedAgent.tag}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {activeStarted === "romain" ? (
              <VoiceChatTab onStartReview={onStartReview} />
            ) : activeStarted === "anna" ? (
              <AnnaVoiceTab />
            ) : (
              <MarcExamTab />
            )}
          </div>
        </div>
      ) : (
        // ── Chooser: flip between casual tutors and the mock-exam examiner. ──
        <div className="relative h-full w-full flex flex-col overflow-hidden">
          {/* Mode flip — a two-sided pill pinned above the chooser content. */}
          {isAdmin && (
          <div className="flex-shrink-0 flex justify-center pt-5 pb-1 z-10">
            <div className="inline-flex items-center rounded-full border border-border bg-card p-1 shadow-sm">
              {(
                [
                  { id: "casual", label: "Casual", icon: <MessageCircle className="w-3.5 h-3.5" /> },
                  { id: "test-mock", label: "Test Mock", icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
                ] as const
              ).map((side) => (
                <button
                  key={side.id}
                  onClick={() => flipTo(side.id)}
                  aria-pressed={activeMode === side.id}
                  className={cn(
                    "relative flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-colors",
                    activeMode === side.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {activeMode === side.id && (
                    <motion.span
                      layoutId="speaking-mode-pill"
                      className={cn(
                        "absolute inset-0 rounded-full",
                        side.id === "test-mock" ? "bg-amber-600" : "bg-primary",
                      )}
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {side.icon}
                    {side.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          )}

          {activeMode === "test-mock" ? (
            // ── Test mock: one examiner, one click, straight into the exam. ──
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <button
                onClick={() => setStarted("marc")}
                className="group flex flex-col items-center gap-5 outline-none"
              >
                <motion.div
                  layoutId={avatarLayoutId("marc")}
                  className="relative h-36 w-36 md:h-56 md:w-56 rounded-full overflow-hidden ring-4 ring-amber-500/40 shadow-[0_0_60px_-12px] shadow-amber-500/40 transition-transform duration-300 group-hover:scale-105"
                >
                  <MarcAvatar />
                </motion.div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl md:text-3xl font-bold tracking-tight">{MARC.name}</span>
                  <span className="text-xs md:text-sm text-muted-foreground">{MARC.tag}</span>
                </div>
                <span className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-bold shadow-lg bg-amber-600 text-white transition-all group-hover:scale-105">
                  <Play className="h-4 w-4 fill-current" />
                  Enter the Mock Oral Exam
                </span>
              </button>
              <p className="text-xs text-muted-foreground max-w-sm text-center leading-relaxed">
                A ~10-minute TCF Expression Orale simulation: three tasks, French only, feedback at the end.
              </p>
            </div>
          ) : (
          <div className="relative flex-1 w-full flex flex-col md:flex-row overflow-hidden">
          {AGENTS.map((agent, i) => {
            const isSelected = selected === agent.id;
            const isDimmed = selected !== null && !isSelected;
            return (
              <button
                key={agent.id}
                onClick={() => setSelected(agent.id)}
                aria-pressed={isSelected}
                className={cn(
                  "group relative flex-1 flex flex-col items-center justify-center gap-5 p-8",
                  "bg-gradient-to-b to-transparent transition-all duration-300 outline-none",
                  i === 0 ? "md:border-r border-b md:border-b-0 border-border" : "",
                  isSelected ? agent.tint : "from-transparent",
                  isDimmed ? "opacity-40 grayscale" : "opacity-100",
                )}
              >
                <div className={cn("transition-transform duration-300", !isDimmed && "group-hover:scale-105")}>
                  <AgentAvatar agent={agent} active={isSelected} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-2xl md:text-3xl font-bold tracking-tight">{agent.name}</span>
                  <span className="text-xs md:text-sm text-muted-foreground">{agent.tag}</span>
                </div>
                <span
                  className={cn(
                    "font-display text-[11px] uppercase tracking-widest transition-opacity",
                    isSelected ? "opacity-0" : "opacity-0 group-hover:opacity-60",
                  )}
                >
                  Click to choose
                </span>
              </button>
            );
          })}

          {/* Floating Start button — appears once a tutor is selected. */}
          <div
            className={cn(
              "absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-300",
              selected ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none",
            )}
          >
            {selected && selected !== "marc" && (
              <button
                onClick={() => setStarted(selected)}
                className={cn(
                  "flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-bold shadow-lg transition-all hover:scale-105",
                  AGENTS.find((a) => a.id === selected)!.button,
                )}
              >
                <Play className="h-4 w-4 fill-current" />
                Start with {AGENTS.find((a) => a.id === selected)!.name}
              </button>
            )}
          </div>
          </div>
          )}
        </div>
      )}
    </LayoutGroup>
  );
}

export default VoiceAgentChooser;
