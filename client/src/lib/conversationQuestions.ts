/**
 * Stall-recovery question bank, shared by Romain (OpenAI Realtime) and Anna
 * (ElevenLabs).
 *
 * Both tutors stall the same way: the student gives two or three short answers,
 * the topic runs dry, and the tutor either repeats itself or waits in silence.
 *
 * The whole bank is NOT sent to the model. Only a small sample is drawn per
 * session (see stallQuestionInstruction), which keeps the prompt small no
 * matter how large this file grows and means every session gets a different
 * set — the tutors stop circling the same handful of topics across sessions.
 * Add questions here freely; the prompt cost does not move.
 *
 * The questions stay in French for every language-mix setting. "All English"
 * only redirects explanations and corrections — the conversation itself is
 * meant to stay French, so a stall question is part of the conversation, not an
 * explanation.
 *
 * Anna's base prompt lives in the ElevenLabs dashboard rather than this repo,
 * so keeping the bank here and injecting the sample at session start is the
 * only way both tutors can share one copy.
 */

/**
 * Keywords that mark a theme as relevant to a given student. Matched (case
 * insensitively, substring) against the memory Romain/Anna have stored about
 * them, so a student whose memory mentions their dog gets more questions about
 * people and pets. Themes with no keywords are never boosted, only drawn at
 * random.
 */
const THEME_KEYWORDS: Record<string, string[]> = {
  "Le quotidien": ["routine", "matin", "soir", "journée", "morning", "evening", "schedule"],
  "La nourriture": ["cuisine", "cuisiner", "manger", "restaurant", "food", "cook", "eat", "plat", "recipe", "coffee", "café"],
  "Les voyages": ["voyage", "travel", "trip", "pays", "country", "vacances", "holiday", "visite", "visited"],
  "Le travail et les études": ["travail", "work", "job", "bureau", "office", "étude", "study", "school", "université", "engineer", "developer", "company"],
  "Les loisirs et le sport": ["sport", "foot", "running", "courir", "gym", "vélo", "bike", "hobby", "loisir", "tennis", "natation", "swim", "yoga", "hiking", "randonnée"],
  "La culture": ["film", "movie", "musique", "music", "livre", "book", "série", "series", "lire", "read", "concert", "podcast"],
  "Les gens": ["famille", "family", "ami", "friend", "chien", "dog", "chat", "cat", "frère", "sœur", "enfant", "kid", "femme", "mari", "wife", "husband"],
  "Les souvenirs": ["souvenir", "enfance", "childhood", "memory", "grandi", "grew up", "hometown"],
  "Les opinions et l'imaginaire": [],
  "Le français": ["français", "french", "apprendre", "learn", "niveau", "level", "delf", "dalf", "b1", "b2"],
};

/** Themed question bank. B1 level, about the student, persona-neutral so both tutors can use it. */
const QUESTION_BANK: Record<string, string[]> = {
  "Le quotidien": [
    "Ça ressemble à quoi, une journée normale pour toi ?",
    "Tu es plutôt du matin ou du soir ?",
    "Qu'est-ce que tu as fait ce week-end ?",
    "Tu as prévu quelque chose cette semaine ?",
    "C'est quoi la première chose que tu fais en te levant ?",
    "Tu prends le temps de déjeuner, ou tu manges vite fait ?",
    "Comment tu vas au travail le matin ?",
    "Tu arrives à bien dormir en ce moment ?",
    "Qu'est-ce qui te prend le plus de temps dans une journée ?",
    "Tu fais quoi le soir pour décompresser ?",
    "Ton week-end idéal, ça ressemble à quoi ?",
    "Il y a quelque chose que tu remets toujours à demain ?",
  ],
  "La nourriture": [
    "Qu'est-ce que tu aimes cuisiner ?",
    "C'est quoi ton plat préféré ?",
    "Tu préfères manger au restaurant ou à la maison ?",
    "Il y a un plat français que tu voudrais essayer ?",
    "Tu cuisines souvent, ou plutôt rarement ?",
    "C'est quoi le meilleur truc que tu saches faire en cuisine ?",
    "Il y a un aliment que tu détestes vraiment ?",
    "Tu prends un café le matin ? Tu le bois comment ?",
    "C'est quoi le dernier bon restaurant où tu es allé ?",
    "Tu as déjà goûté des escargots ou un fromage qui sent très fort ?",
    "Chez toi, c'est qui qui fait la cuisine ?",
    "Tu préfères le sucré ou le salé ?",
  ],
  "Les voyages": [
    "Tu es déjà allé en France ?",
    "C'est quoi le plus bel endroit que tu as visité ?",
    "Tu préfères la mer ou la montagne ?",
    "Si tu pouvais partir demain, tu irais où ?",
    "Tu aimes voyager seul ou avec des amis ?",
    "C'est quoi ton meilleur souvenir de vacances ?",
    "Tu préfères l'avion ou le train ?",
    "Il y a un endroit où tu ne retournerais jamais ?",
    "Tu prépares tes voyages à l'avance ou tu improvises ?",
    "Quelle ville tu aimerais visiter en France ?",
    "Tu as déjà eu un problème en voyage ?",
    "Pour des vacances, plutôt la plage ou plutôt la ville ?",
  ],
  "Le travail et les études": [
    "Tu fais quoi comme travail ?",
    "Qu'est-ce qui te plaît le plus dans ce que tu fais ?",
    "C'est quoi le plus difficile dans ton travail ?",
    "Tu travailles plutôt chez toi ou au bureau ?",
    "Tu voulais faire quoi quand tu étais petit ?",
    "Tes collègues, ils sont sympas ?",
    "Tu as beaucoup de réunions dans une semaine ?",
    "Si tu pouvais changer de métier, tu ferais quoi ?",
    "C'est quoi une bonne journée de travail pour toi ?",
    "Tu arrives à décrocher le soir, ou tu penses encore au boulot ?",
    "Tu as étudié quoi ?",
    "Tu préfères travailler en équipe ou tout seul ?",
  ],
  "Les loisirs et le sport": [
    "Qu'est-ce que tu fais pour te détendre ?",
    "Tu fais du sport en ce moment ?",
    "Tu as un hobby que tu pratiques depuis longtemps ?",
    "Le week-end, tu préfères sortir ou rester tranquille à la maison ?",
    "Il y a un sport que tu aimerais essayer ?",
    "Tu regardes le foot ? Tu as une équipe ?",
    "Tu marches beaucoup dans une journée ?",
    "Courir un marathon, ça te tente ou pas du tout ?",
    "C'est quand, la dernière fois que tu as fait quelque chose pour la première fois ?",
    "Tu joues d'un instrument ?",
    "Tu préfères la salle de sport ou le sport dehors ?",
    "Tu as un endroit préféré près de chez toi ?",
  ],
  "La culture": [
    "Tu as vu un bon film récemment ?",
    "Tu écoutes quoi comme musique ?",
    "Tu lis quelque chose en ce moment ?",
    "Tu regardes des séries en français ?",
    "Tu connais des chanteurs français ?",
    "C'est quoi le dernier film qui t'a vraiment marqué ?",
    "Tu préfères le cinéma ou regarder à la maison ?",
    "Tu vas parfois à des concerts ?",
    "Il y a un livre que tu relis toujours ?",
    "Tu écoutes des podcasts ?",
    "Tu préfères les films drôles ou les films sérieux ?",
    "Il y a un film français que tu as aimé ?",
  ],
  "Les gens": [
    "Tu as une grande famille ?",
    "Tu vois souvent tes amis ?",
    "Tu as un animal à la maison ?",
    "Qui est la personne qui te fait le plus rire ?",
    "Tu as des frères et sœurs ?",
    "Comment tu as rencontré ton meilleur ami ?",
    "Tu es plutôt sociable ou plutôt solitaire ?",
    "Tu appelles souvent ta famille ?",
    "C'est qui la personne la plus importante pour toi ?",
    "Tu préfères les grandes fêtes ou les petits dîners entre amis ?",
    "Tu as gardé des amis d'enfance ?",
    "Il y a quelqu'un qui t'a beaucoup inspiré ?",
  ],
  "Les souvenirs": [
    "C'est quoi ton meilleur souvenir d'enfance ?",
    "Tu te souviens de ton premier voyage ?",
    "Il y a une année qui a vraiment changé ta vie ?",
    "C'est quoi la meilleure chose qui t'est arrivée cette année ?",
    "Tu as grandi où ?",
    "C'était comment, ton école ?",
    "Tu te souviens de ton premier travail ?",
    "Il y a une chanson qui te rappelle ton enfance ?",
    "Qu'est-ce qui te manque de quand tu étais jeune ?",
    "Tu as déjà déménagé loin ?",
    "C'est quoi la décision la plus difficile que tu as prise ?",
    "Tu as une photo préférée ? Elle représente quoi ?",
  ],
  "Les opinions et l'imaginaire": [
    "Si tu gagnais au loto, tu ferais quoi ?",
    "Tu préférerais vivre à la campagne ou en ville ?",
    "Si tu pouvais apprendre une autre langue, ce serait laquelle ?",
    "Qu'est-ce qui te met de bonne humeur ?",
    "Si tu pouvais dîner avec n'importe qui, ce serait avec qui ?",
    "Tu préférerais pouvoir voler ou être invisible ?",
    "C'est quoi le meilleur conseil qu'on t'ait donné ?",
    "Si tu pouvais vivre dans un autre pays, ce serait lequel ?",
    "Qu'est-ce qui t'énerve le plus dans la vie de tous les jours ?",
    "Tu es plutôt optimiste ou plutôt pessimiste ?",
    "Si tu avais une journée complètement libre, tu ferais quoi ?",
    "Tu crois qu'on vivra un jour sur Mars ?",
  ],
  "Le français": [
    "Pourquoi tu as commencé à apprendre le français ?",
    "Qu'est-ce qui est le plus dur pour toi en français ?",
    "Tu as un mot français que tu adores ?",
    "Tu voudrais parler français dans quelle situation ?",
    "Depuis combien de temps tu apprends le français ?",
    "Qu'est-ce qui te fait progresser le plus ?",
    "Tu as déjà parlé français avec un Français ?",
    "C'est quoi le son le plus difficile à prononcer pour toi ?",
    "Tu préfères écouter ou parler ?",
    "Il y a une expression française que tu trouves bizarre ?",
    "Tu rêves parfois en français ?",
    "Qu'est-ce que tu aimerais pouvoir dire en français mais tu n'y arrives pas encore ?",
  ],
};

/** Total questions available. Exported for the sanity test. */
export const QUESTION_BANK_SIZE = Object.values(QUESTION_BANK).reduce((n, q) => n + q.length, 0);

/** Fisher-Yates, non-mutating. */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Themes whose keywords appear in the student's stored memory. */
function boostedThemes(memory: string | null | undefined): string[] {
  if (!memory || !memory.trim()) return [];
  const hay = memory.toLowerCase();
  return Object.keys(QUESTION_BANK).filter((theme) =>
    (THEME_KEYWORDS[theme] ?? []).some((kw) => hay.includes(kw))
  );
}

/**
 * Draws `count` questions spread across themes. Themes the student's memory
 * suggests they care about go first in the rotation, so they contribute more
 * questions, but every theme stays reachable — a student who only ever talks
 * about work should still occasionally get asked about food.
 */
export function sampleQuestions(memory?: string | null, count = 10): string[] {
  const themes = Object.keys(QUESTION_BANK);
  // Boosted themes enter the draw order TWICE, so they contribute roughly
  // double the questions. Ordering alone would do nothing: with ten themes and
  // ten questions the round-robin takes exactly one from each regardless of
  // order, so the weighting has to change how often a theme is drawn.
  const order = shuffle([...themes, ...boostedThemes(memory)]);
  if (order.length === 0) return [];

  // One shuffled pool per theme; draw round-robin so the sample spans themes.
  const pools = new Map(themes.map((t) => [t, shuffle(QUESTION_BANK[t])]));
  const picked: string[] = [];
  for (let round = 0; picked.length < count && round < count; round++) {
    for (const theme of order) {
      if (picked.length >= count) break;
      const next = pools.get(theme)!.pop();
      if (next) picked.push(next);
    }
  }
  return shuffle(picked);
}

/**
 * Returns the system prompt snippet: when to reach for a question, how to ask
 * it, and this session's sample. Call ONCE per session and reuse the result —
 * re-sampling mid-session would hand the tutor a fresh set and defeat the
 * "never ask the same question twice" rule.
 */
export function stallQuestionInstruction(memory?: string | null, count = 10): string {
  const questions = sampleQuestions(memory, count).map((q) => `- ${q}`).join("\n");

  return [
    "# When the conversation stalls",
    "Reach for a new question when the conversation runs out of air — the student has given short answers two or three turns in a row, the current topic is clearly exhausted, they answer \"je ne sais pas\" or \"euh...\" repeatedly, or there is a long silence that is not them thinking.",
    "How to do it:",
    "- Ask ONE question, in French, and let it breathe. Never fire off two at once.",
    "- Lead in naturally so it doesn't feel like a questionnaire: \"Au fait,...\", \"Et sinon,...\", \"Dis-moi,...\", \"Tiens, j'y pense —...\".",
    "- Prefer a question that connects to something the student already mentioned, in this session or in what you remember about them. Only jump to an unrelated subject when nothing connects.",
    "- Once they answer, follow THEIR answer with genuine curiosity. Do not immediately reach for another question from the list — these restart a conversation, they do not replace one.",
    "- Never ask the same question twice in a session, and don't work down the list in order.",
    "- Reword freely to match how you actually talk and to fit the student's level. These are prompts, not a script.",
    "- Never announce that you're changing the subject, and never mention that you have a list of questions.",
    "Questions for this session:",
    questions,
  ].join("\n");
}
