/**
 * TCF Task 2 sujets — the printed document a candidate has in front of them.
 *
 * In the real exam the examiner hands over a sheet; here Marc puts it on screen
 * by calling the `afficher_sujet` client tool, which the ElevenLabs workflow
 * forces on entry to the `task2_setup` node. The keys below are that tool's
 * `sujet_id` enum, so adding a sujet means adding it in both places.
 *
 * The spoken consigne lives in the workflow node prompt; `consigne` here is only
 * what the candidate reads, kept as real text so it survives a small screen.
 */

export interface Task2Sujet {
  id: string;
  label: string;
  consigne: string;
  image: string;
  alt: string;
}

export const TASK2_SUJETS: Record<string, Task2Sujet> = {
  logement: {
    id: "logement",
    label: "Tâche 2 — Sujet 1",
    consigne:
      "Je suis un agent immobilier. Vous cherchez un logement. Vous m'expliquez ce que vous cherchez.",
    image: "/tcf/task2-sujet1-logement.png",
    alt:
      "Document du sujet : trois annonces de logement — un studio meublé de 20 m² en centre-ville, " +
      "un deux-pièces vide de 35 m² proche du centre, et une maison individuelle de 55 m² en proche banlieue.",
  },
};

/** The sujet Marc falls back to if the tool call never lands. */
export const DEFAULT_TASK2_SUJET = TASK2_SUJETS.logement;

export function resolveTask2Sujet(id: unknown): Task2Sujet | null {
  return typeof id === "string" ? TASK2_SUJETS[id] ?? null : null;
}
