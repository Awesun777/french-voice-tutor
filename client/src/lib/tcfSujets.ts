/**
 * TCF Task 2 sujets — the printed document a candidate has in front of them.
 *
 * In the real exam the examiner hands over a sheet; here Marc puts it on screen
 * by calling the `afficher_sujet` client tool at the start of Task 2. The
 * client, not Marc, decides *which* sujet a sitting uses: it picks one before
 * connecting and ships `consigne` / `apercu` / `fiche` as dynamic variables, so
 * only the chosen scenario's facts ever reach the model. Adding a sujet here is
 * therefore a repo-only change — the ElevenLabs agent needs no update.
 *
 * `consigne` is what the candidate reads AND what Marc reads aloud. `fiche` is
 * the opposite: facts the sheet deliberately withholds ("Loyer : voir avec
 * l'agence"), which Marc reveals only when asked during the exchange.
 */

export interface Task2Sujet {
  id: string;
  label: string;
  consigne: string;
  image: string;
  alt: string;
  /** One spoken clause naming what the document shows, for Marc's announcement. */
  apercu: string;
  /** Marc's private fact sheet for the exchange. Never printed on the document. */
  fiche: string;
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
    apercu: "trois annonces : un studio, un deux-pièces et une maison individuelle",
    fiche:
      "• Studio, 20 m², centre-ville, meublé, kitchenette — 620 € par mois charges comprises ; " +
      "4e étage sans ascenseur ; libre immédiatement ; commerces et tramway en bas de l'immeuble ; pas de balcon.\n" +
      "• Deux-pièces, 35 m², proche centre, vide (non meublé) — 780 € par mois plus 50 € de charges ; " +
      "2e étage avec ascenseur ; balcon ; libre le 1er du mois prochain ; place de parking en option à 40 € par mois.\n" +
      "• Maison individuelle, 55 m², proche banlieue, vide, cuisine équipée — 950 € par mois ; " +
      "petit jardin et garage ; libre dans un mois ; vingt minutes du centre en bus.\n" +
      "• Conditions de l'agence : dépôt de garantie d'un mois de loyer ; frais d'agence 300 € ; " +
      "justificatif de revenus et un garant demandés ; bail d'un an renouvelable ; " +
      "visites possibles en fin de semaine ; animaux acceptés dans la maison seulement.",
  },
  restaurant: {
    id: "restaurant",
    label: "Tâche 2 — Sujet 2",
    consigne:
      "Je suis le gérant d'un restaurant. Vous voulez organiser un repas de famille. Vous m'expliquez ce que vous cherchez.",
    image: "/tcf/task2-sujet2-restaurant.png",
    alt:
      "Document du sujet : trois salles de restaurant — une petite salle de 15 personnes au rez-de-chaussée, " +
      "une grande salle de 40 personnes au premier étage, et une terrasse couverte de 25 personnes dans un jardin.",
    apercu: "trois salles : une petite salle, une grande salle et une terrasse couverte",
    fiche:
      "• Petite salle, 15 personnes, rez-de-chaussée — menu entrée-plat-dessert à 29 € par personne ; " +
      "boissons non comprises ; disponible tous les soirs sauf le samedi ; pas de supplément de privatisation.\n" +
      "• Grande salle, 40 personnes, premier étage sans ascenseur — menu à 34 € ou buffet à 38 € par personne ; " +
      "privatisation 100 € le samedi soir ; libre en semaine ; deux marches à l'entrée de la salle.\n" +
      "• Terrasse couverte, 25 personnes, jardin — buffet uniquement à 32 € par personne ; " +
      "chauffée d'octobre à mars ; fermée en cas de forte pluie ; disponible le week-end.\n" +
      "• Conditions du restaurant : réservation au moins deux semaines à l'avance ; acompte de 30 % ; " +
      "menu choisi cinq jours avant ; annulation gratuite jusqu'à 72 heures ; gâteau apporté par le client " +
      "accepté sans droit de bouchon ; menu enfant à 12 € ; deux plats végétariens possibles sur demande.",
  },
};

/** The sujet Marc falls back to if the tool call never lands. */
export const DEFAULT_TASK2_SUJET = TASK2_SUJETS.logement;

export function resolveTask2Sujet(id: unknown): Task2Sujet | null {
  return typeof id === "string" ? TASK2_SUJETS[id] ?? null : null;
}

/**
 * Choose the sujet for a sitting. A pinned id wins; anything else (including
 * the "auto" the Sujet select sends by default) draws at random, so repeated
 * practice does not drill the same scenario.
 */
export function pickTask2Sujet(pinned?: string): Task2Sujet {
  const chosen = resolveTask2Sujet(pinned);
  if (chosen) return chosen;
  const all = Object.values(TASK2_SUJETS);
  return all[Math.floor(Math.random() * all.length)] ?? DEFAULT_TASK2_SUJET;
}
