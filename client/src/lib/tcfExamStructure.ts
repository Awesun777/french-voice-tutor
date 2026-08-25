/**
 * The shape of Marc's exam, as the admin Workflow tab draws it.
 *
 * Two things are described here and they are not the same thing:
 *
 * - The **official TCF Canada** expression orale: three tasks, 12 minutes on the
 *   clock. These durations come from the exam spec, not from our agent, and they
 *   are what the candidate is actually assessed against.
 * - **Marc's simulation**, which wraps those three tasks in an opening and a
 *   feedback phase. Neither is part of the official 12 minutes, and the tab has
 *   to keep that distinction visible or the timeline misrepresents the exam.
 *
 * The live node/edge graph is NOT described here — it is read from ElevenLabs by
 * `voice.marcWorkflow`, because the graph is edited in their dashboard too and a
 * second copy would drift.
 */

export interface ExamPhaseSpec {
  /** Workflow node ids this phase covers, in order. */
  nodes: string[];
  label: string;
  french: string;
  /** Seconds. Marc's own pacing for the wrapper phases; the spec for the tasks. */
  seconds: number;
  /** Preparation time inside the phase, in seconds. Counts toward `seconds`. */
  prepSeconds?: number;
  /** False for the phases Marc adds around the official exam. */
  officiel: boolean;
  /** Hex, validated as a categorical set — see EXAM_PALETTE. */
  color: string;
  what: string;
  assessed: string | null;
}

/**
 * Categorical palette, validated for CVD separation, chroma, lightness band and
 * contrast against the white card surface. The order is the timeline order, so
 * re-ordering phases means re-validating adjacency — do not shuffle these.
 */
export const EXAM_PALETTE = ["#3479BE", "#B8801A", "#C24A57", "#8560B5", "#3E9268"] as const;

export const EXAM_PHASES: ExamPhaseSpec[] = [
  {
    nodes: ["opening"],
    label: "Opening",
    french: "Mise en route",
    seconds: 60,
    officiel: false,
    color: EXAM_PALETTE[0],
    what: "Recording notice, identity check, and the run-through of how the exam works.",
    assessed: null,
  },
  {
    nodes: ["task1"],
    label: "Tâche 1",
    french: "Entretien dirigé",
    seconds: 120,
    officiel: true,
    color: EXAM_PALETTE[1],
    what: "Marc asks, the candidate answers. Self-presentation and follow-ups, no preparation.",
    assessed: "Fluency and range on familiar ground.",
  },
  {
    nodes: ["task2_setup", "task2_exchange"],
    label: "Tâche 2",
    french: "Exercice en interaction",
    seconds: 330,
    prepSeconds: 120,
    officiel: true,
    color: EXAM_PALETTE[2],
    what: "Role play against a printed document. The candidate leads: they ask, Marc answers.",
    assessed: "Interaction — asking, comparing, negotiating.",
  },
  {
    nodes: ["task3"],
    label: "Tâche 3",
    french: "Expression d'un point de vue",
    seconds: 270,
    officiel: true,
    color: EXAM_PALETTE[3],
    what: "A monologue arguing a position, with no preparation time.",
    assessed: "Coherence, argument, and register.",
  },
  {
    nodes: ["feedback"],
    label: "Feedback",
    french: "Retour",
    seconds: 120,
    officiel: false,
    color: EXAM_PALETTE[4],
    what: "Marc drops the examiner role and gives a level estimate with what to work on.",
    assessed: null,
  },
];

export const OFFICIAL_SECONDS = EXAM_PHASES.filter((p) => p.officiel).reduce((n, p) => n + p.seconds, 0);
export const TOTAL_SECONDS = EXAM_PHASES.reduce((n, p) => n + p.seconds, 0);

/** "5 min 30" / "2 min" — the way the exam spec writes durations. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s}` : `${m} min`;
}

/** Dynamic variables the client ships at connect time, and who reads them. */
export const DYNAMIC_VARIABLES = [
  {
    name: "phase_depart",
    value: "complet | tache1 | tache2 | tache3",
    readBy: "start_node",
    why: "Routes the sitting straight into one task. The SDK cannot send starting_workflow_node_id, so expression edges read this instead.",
  },
  {
    name: "sujet_id",
    value: "id of the drawn sujet",
    readBy: "task2_setup",
    why: "Named in the afficher_sujet call so the transcript records which document was shown.",
  },
  {
    name: "consigne_task2",
    value: "the sujet's consigne",
    readBy: "task2_setup, task2_exchange",
    why: "Read aloud verbatim, and it is what tells Marc which role he is playing.",
  },
  {
    name: "apercu_task2",
    value: "what the document shows",
    readBy: "task2_setup",
    why: "Spoken after the consigne so the candidate knows what is on the sheet.",
  },
  {
    name: "fiche_task2",
    value: "Marc's private fact sheet",
    readBy: "task2_exchange",
    why: "The figures the document withholds. Only the drawn sujet's sheet is sent, so Marc cannot quote another scenario's prices.",
  },
];

/**
 * What actually opens a connection, and when.
 *
 * The thing worth understanding: a sitting is ONE WebSocket. The phases are
 * nodes inside the graph on that single connection, so nothing reconnects
 * between tasks and every phase runs on the same ASR, LLM and TTS. What varies
 * per phase is the node prompt and a few turn settings — nothing else.
 */
export const CONNECTION_STEPS = [
  {
    when: "Before the first word",
    what: "voiceSession.create",
    where: "tRPC → MySQL",
    detail: "Opens the row the transcript and the feedback will hang off.",
  },
  {
    when: "Before the first word",
    what: "voice.marcSignedUrl",
    where: "tRPC (admin only) → ElevenLabs REST",
    detail:
      "GET /v1/convai/conversation/get-signed-url. ELEVENLABS_API_KEY never leaves the server — the browser receives only a short-lived signed URL.",
  },
  {
    when: "Handshake",
    what: "conversation_initiation_client_data",
    where: "wss:// ElevenLabs",
    detail:
      "Carries the dynamic variables, and on a phase jump the firstMessage override. This is where phase_depart decides which node the sitting starts on.",
  },
  {
    when: "Every turn, every phase",
    what: "audio → ASR → LLM → TTS → audio",
    where: "the same socket",
    detail:
      "One connection for the whole exam. Advancing a task moves a pointer inside the graph; it does not reconnect and does not change models.",
  },
  {
    when: "Start of Tâche 2",
    what: "afficher_sujet",
    where: "in the browser",
    detail:
      "A client tool: the agent asks the page to run it and the page answers on the open socket. No extra network hop, and the sheet is a local asset.",
  },
  {
    when: "When the exam ends",
    what: "voiceSession.end",
    where: "tRPC → MySQL",
    detail: "Closes the row. A disconnect from the agent side counts as the end of the sitting.",
  },
];
