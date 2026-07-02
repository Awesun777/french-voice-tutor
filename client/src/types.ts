// Shared frontend types for the French Dictionary app

export interface VocabEntry {
  id: number;
  userId: number;
  term: string;
  translation: string;
  entryKind: "word" | "phrase";
  lessonSource?: string | null;
  starred: boolean;
  quizCount: number;
  wrongCount: number;
  lastQuizzed?: Date | null;
  dateKey: string;
  createdAt: Date;
  updatedAt: Date;
  // SM-2 fields
  sm2EaseFactor?: number | null;
  sm2Interval?: number | null;
  sm2Repetitions?: number | null;
  sm2NextReviewAt?: number | null;
  sm2LastReviewAt?: number | null;
  sm2Status?: "new" | "learning" | "review" | "mastered" | null;
  groupLabel?: string | null;
}

export interface DictWordResult {
  type: "word";
  found: boolean;
  word: string;
  isConjugated: boolean;
  conjugationInfo: string | null;
  baseForm: string;
  formExplanation: string | null;
  translation: string;
  pronunciation: string;
  wordType: string;
  isReflexive: boolean;
  reflexiveType: string | null;
  reflexiveExplanation: string | null;
  hasReflexiveForm: boolean;
  // Preposition the verb governs before its object: "à", "de", or "" (none).
  governedPreposition: string;
  prepositionExplanation: string | null;
  // For adjectives/state words: which verb expresses the state — "avoir"
  // (j'ai faim), "être" (je suis content), or "" (not applicable).
  adjectiveAuxiliary: string;
  adjectiveAuxiliaryExplanation: string | null;
  reflexiveForm: string | null;
  nonReflexiveForm: string | null;
  examples: { fr: string; en: string }[];
  conjugations: {
    present: string[];
    imparfait: string[];
    passeCompose: string[];
    futurSimple: string[];
    conditionnel: string[];
    subjonctif: string[];
  };
  synonyms: { word: string; meaning: string }[];
  confusingWords: { word: string; meaning: string; difference: string }[];
  grammar: string;
}

export interface DictPhraseResult {
  type: "phrase";
  found: boolean;
  phrase: string;
  translation: string;
  pronunciation: string;
  literalTranslation: string;
  examples: { fr: string; en: string }[];
  usage: string;
}

export interface DictQuestionResult {
  type: "question";
  question: string;
  answer: string;
  options: { french: string; english: string; summary: string }[];
}

/** The "heavy" half of a word entry, fetched separately by dictionary.searchDetails. */
export interface DictWordDetails {
  conjugations: DictWordResult["conjugations"];
  synonyms: DictWordResult["synonyms"];
  confusingWords: DictWordResult["confusingWords"];
}

export type DictResult = DictWordResult | DictPhraseResult | DictQuestionResult | { type: "error"; message: string };

export type SidebarTab = "dictionary" | "library" | "quiz" | "flashcards" | "grammar" | "tutor" | "voice-chat" | "progress";

export interface ImportItem {
  term: string;
  translation: string;
  kind: "word" | "phrase";
  entryKind?: "word" | "phrase";
  dateKey?: string; // YYYY-MM-DD, set when document has date headers
}
