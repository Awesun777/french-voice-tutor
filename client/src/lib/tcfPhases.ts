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
 * exam, whereas a node first_message would ride along on every transition.
 */

import { TASK2_SUJETS, type Task2Sujet } from "@/lib/tcfSujets";

export type ExamPhase = "complet" | "tache1" | "tache2" | "tache3";

export interface PhaseEntry {
  id: Exclude<ExamPhase, "complet">;
  label: string;
  blurb: string;
  /** Spoken opener, standing in for the full exam introduction. */
  firstMessage: string;
  /** Shown immediately on entry — a jump can't wait for Marc's tool call. */
  sujet?: Task2Sujet;
}

export const PHASE_ENTRIES: PhaseEntry[] = [
  {
    id: "tache1",
    label: "Tâche 1",
    blurb: "Entretien dirigé",
    firstMessage:
      'Bonjour. Nous passons directement à la tâche une : l\'entretien dirigé. <break time="0.6s" /> ' +
      "Est-ce que vous pouvez vous présenter ?",
  },
  {
    id: "tache2",
    label: "Tâche 2",
    blurb: "Exercice en interaction",
    firstMessage:
      'Bonjour. Nous passons directement à la tâche deux : l\'exercice en interaction. <break time="0.6s" /> ' +
      'Le sujet est affiché à l\'écran devant vous. Je vous lis la consigne : <break time="0.5s" /> ' +
      "Je suis un agent immobilier. Vous cherchez un logement. Vous m'expliquez ce que vous cherchez. " +
      '<break time="0.8s" /> Vous avez compris ?',
    sujet: TASK2_SUJETS.logement,
  },
  {
    id: "tache3",
    label: "Tâche 3",
    blurb: "Point de vue",
    firstMessage:
      'Bonjour. Nous passons directement à la tâche trois : l\'expression d\'un point de vue. <break time="0.6s" /> ' +
      "Je vais vous poser une question, et vous allez me donner votre opinion en la justifiant, " +
      'avec des arguments et des exemples. Vous n\'avez pas de temps de préparation. <break time="0.8s" /> ' +
      'Voici la question : <break time="0.5s" /> Pensez-vous qu\'il est préférable de vivre en ville ou à la campagne ? ' +
      'Pourquoi ? <break time="0.6s" /> Je vous écoute.',
  },
];
