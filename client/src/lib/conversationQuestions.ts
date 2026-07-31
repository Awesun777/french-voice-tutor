/**
 * Stall-recovery question bank, shared by Romain (OpenAI Realtime) and Anna
 * (ElevenLabs).
 *
 * Both tutors stall the same way: the student gives two or three short answers,
 * the topic runs dry, and the tutor either repeats itself or waits in silence.
 * The base prompts only offered two hardcoded examples ("Au fait, tu aimes
 * voyager ?"), which is why they kept reaching for the same handful of topics.
 *
 * The questions stay in French for every language-mix setting. "All English"
 * only redirects explanations and corrections — the conversation itself is
 * meant to stay French, so a stall question is part of the conversation, not an
 * explanation.
 *
 * Anna's base prompt lives in the ElevenLabs dashboard rather than this repo,
 * so keeping the bank here and injecting it at session start is the only way
 * both tutors can share one copy.
 */

/** Themed question bank. Grouped so the tutor can pick a theme adjacent to whatever just died. */
const QUESTION_BANK: Record<string, string[]> = {
  "Le quotidien": [
    "Ça ressemble à quoi, une journée normale pour toi ?",
    "Tu es plutôt du matin ou du soir ?",
    "Qu'est-ce que tu as fait ce week-end ?",
    "Tu as prévu quelque chose cette semaine ?",
  ],
  "La nourriture": [
    "Qu'est-ce que tu aimes cuisiner ?",
    "C'est quoi ton plat préféré ?",
    "Tu préfères manger au restaurant ou à la maison ?",
    "Il y a un plat français que tu voudrais essayer ?",
  ],
  "Les voyages": [
    "Tu es déjà allé en France ?",
    "C'est quoi le plus bel endroit que tu as visité ?",
    "Tu préfères la mer ou la montagne ?",
    "Si tu pouvais partir demain, tu irais où ?",
  ],
  "Le travail et les études": [
    "Tu fais quoi comme travail ?",
    "Qu'est-ce qui te plaît le plus dans ce que tu fais ?",
    "C'est quoi le plus difficile dans ton travail ?",
    "Tu travailles plutôt chez toi ou au bureau ?",
  ],
  "Les loisirs et le sport": [
    "Qu'est-ce que tu fais pour te détendre ?",
    "Tu fais du sport en ce moment ?",
    "Tu as un hobby que tu pratiques depuis longtemps ?",
    "Le week-end, tu préfères sortir ou rester tranquille à la maison ?",
  ],
  "La culture": [
    "Tu as vu un bon film récemment ?",
    "Tu écoutes quoi comme musique ?",
    "Tu lis quelque chose en ce moment ?",
    "Tu regardes des séries en français ?",
  ],
  "Les gens": [
    "Tu as une grande famille ?",
    "Tu vois souvent tes amis ?",
    "Tu as un animal à la maison ?",
    "Qui est la personne qui te fait le plus rire ?",
  ],
  "Les souvenirs": [
    "C'est quoi ton meilleur souvenir d'enfance ?",
    "Tu te souviens de ton premier voyage ?",
    "Il y a une année qui a vraiment changé ta vie ?",
    "C'est quoi la meilleure chose qui t'est arrivée cette année ?",
  ],
  "Les opinions et l'imaginaire": [
    "Si tu gagnais au loto, tu ferais quoi ?",
    "Tu préférerais vivre à la campagne ou en ville ?",
    "Si tu pouvais apprendre une autre langue, ce serait laquelle ?",
    "Qu'est-ce qui te met de bonne humeur ?",
  ],
  "Le français": [
    "Pourquoi tu as commencé à apprendre le français ?",
    "Qu'est-ce qui est le plus dur pour toi en français ?",
    "Tu as un mot français que tu adores ?",
    "Tu voudrais parler français dans quelle situation ?",
  ],
};

/**
 * Returns the system prompt snippet: when to reach for a question, how to ask
 * it, and the bank itself.
 */
export function stallQuestionInstruction(): string {
  const bank = Object.entries(QUESTION_BANK)
    .map(([theme, questions]) => `${theme}: ${questions.join(" / ")}`)
    .join("\n");

  return [
    "# When the conversation stalls",
    "Reach for a new question when the conversation runs out of air — the student has given short answers two or three turns in a row, the current topic is clearly exhausted, they answer \"je ne sais pas\" or \"euh...\" repeatedly, or there is a long silence that is not them thinking.",
    "How to do it:",
    "- Ask ONE question, in French, and let it breathe. Never fire off two at once.",
    "- Lead in naturally so it doesn't feel like a questionnaire: \"Au fait,...\", \"Et sinon,...\", \"Dis-moi,...\", \"Tiens, j'y pense —...\".",
    "- Prefer a question that connects to something the student already mentioned, in this session or in what you remember about them. Only jump to an unrelated theme when nothing connects.",
    "- Once they answer, follow THEIR answer with genuine curiosity. Do not immediately reach for another question from the bank — the bank restarts a conversation, it does not replace one.",
    "- Never ask the same question twice in a session, and don't work through a theme in order. Vary the themes you pull from.",
    "- Reword freely to match how you actually talk and to fit the student's level. These are prompts, not a script.",
    "- Never announce that you're changing the subject, and never mention that you have a list of questions.",
    "Question bank, by theme:",
    bank,
  ].join("\n");
}
