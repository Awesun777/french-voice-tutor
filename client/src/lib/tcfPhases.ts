/**
 * Direct entry into one phase of Marc's TCF exam.
 *
 * The ElevenLabs JS SDK cannot send `starting_workflow_node_id`, so the jump
 * rides on a dynamic variable instead: `phase_depart` is read by deterministic
 * expression edges hanging off the workflow's start node, which route before
 * anyone speaks. A normal sitting sends "complet" and falls through to the
 * unconditional edge into the opening, exactly as before.
 *
 * `firstMessage` is duplicated here rather than set as a node-level override on
 * the agent on purpose: an override sent only on a jump cannot leak into a real
 * exam, whereas a node first_message would ride along on every transition. It
 * takes the sitting's sujet because a jump has to announce the document the
 * client actually chose, not a hardcoded one.
 */

import { type Task2Sujet } from "@/lib/tcfSujets";

export type ExamPhase = "complet" | "tache1" | "tache2" | "tache3";

export interface PhaseEntry {
  id: Exclude<ExamPhase, "complet">;
  label: string;
  blurb: string;
  /** Spoken opener, standing in for the full exam introduction. */
  firstMessage: (sujet: Task2Sujet) => string;
  /** True when the phase opens with the document already on screen. */
  showsSujet?: boolean;
}

export const PHASE_ENTRIES: PhaseEntry[] = [
  {
    id: "tache1",
    label: "Tâche 1",
    blurb: "Entretien dirigé",
    firstMessage: () =>
      'Bonjour. Nous passons directement à la tâche une : l\'entretien dirigé. <break time="0.6s" /> ' +
      "Est-ce que vous pouvez vous présenter ?",
  },
  {
    id: "tache2",
    label: "Tâche 2",
    blurb: "Exercice en interaction",
    showsSujet: true,
    firstMessage: (sujet) =>
      'Bonjour. Nous passons directement à la tâche deux : l\'exercice en interaction. <break time="0.6s" /> ' +
      'Le sujet est affiché à l\'écran devant vous. Je vous lis la consigne : <break time="0.5s" /> ' +
      `${sujet.consigne} ` +
      '<break time="0.8s" /> Vous avez compris ?',
  },
  {
    id: "tache3",
    label: "Tâche 3",
    blurb: "Point de vue",
    firstMessage: () =>
      'Bonjour. Nous passons directement à la tâche trois : l\'expression d\'un point de vue. <break time="0.6s" /> ' +
      "Je vais vous poser une question, et vous allez me donner votre opinion en la justifiant, " +
      'avec des arguments et des exemples. Vous n\'avez pas de temps de préparation. <break time="0.8s" /> ' +
      'Voici la question : <break time="0.5s" /> Pensez-vous qu\'il est préférable de vivre en ville ou à la campagne ? ' +
      'Pourquoi ? <break time="0.6s" /> Je vous écoute.',
  },
];
