import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { DictResult, DictWordResult, DictPhraseResult, DictQuestionResult } from "@/types";
import { Volume2, Plus, Loader2, Search, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function pronounce(text: string) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function classifyKind(term: string): "word" | "phrase" {
  return term.trim().split(/\s+/).length >= 3 ? "phrase" : "word";
}

function WordResult({ result, onAdd }: { result: DictWordResult; onAdd: (term: string, translation: string, kind: "word" | "phrase") => void }) {
  const [showConjugations, setShowConjugations] = useState(false);
  const [showSynonyms, setShowSynonyms] = useState(false);
  const [showConfusing, setShowConfusing] = useState(false);

  if (!result.found) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-4xl mb-3">🤷</p>
        <p className="text-foreground font-semibold">Not found as a French word</p>
        <p className="text-muted-foreground text-sm mt-1">Try checking your spelling or searching for a phrase.</p>
      </div>
    );
  }

  const TENSE_LABELS: Record<string, string> = {
    present: "Présent",
    imparfait: "Imparfait",
    passeCompose: "Passé Composé",
    futurSimple: "Futur Simple",
    conditionnel: "Conditionnel",
    subjonctif: "Subjonctif",
  };

  return (
    <div className="space-y-3">
      {/* Main card */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-foreground">{result.word}</h2>
              <button onClick={() => pronounce(result.word)} className="p-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary transition-colors">
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            {result.pronunciation && <p className="text-sm text-muted-foreground font-mono">[{result.pronunciation}]</p>}
          </div>
          <div className="flex items-center gap-2">
            {result.wordType && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary font-semibold capitalize">
                {result.wordType}
              </span>
            )}
            <button
              onClick={() => onAdd(result.word, result.translation, classifyKind(result.word))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        <p className="text-lg text-foreground font-medium mb-3">{result.translation}</p>

        {result.isConjugated && result.baseForm && (
          <div className="bg-muted/50 rounded-xl p-3 mb-3 text-sm">
            <span className="text-muted-foreground">Conjugated form of </span>
            <button onClick={() => pronounce(result.baseForm)} className="text-primary font-semibold hover:underline">{result.baseForm}</button>
            {result.formExplanation && <span className="text-muted-foreground"> — {result.formExplanation}</span>}
          </div>
        )}

        {result.isReflexive && result.reflexiveExplanation && (
          <div className="bg-primary/8 border border-primary/20 rounded-xl p-3 mb-3 text-sm text-foreground">
            <span className="text-primary font-semibold">Reflexive: </span>{result.reflexiveExplanation}
          </div>
        )}

        {result.grammar && (
          <p className="text-sm text-muted-foreground italic mb-3">{result.grammar}</p>
        )}

        {/* Examples */}
        {result.examples?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Examples</p>
            {result.examples.map((ex, i) => (
              <div key={i} className="bg-muted/40 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <button onClick={() => pronounce(ex.fr)} className="mt-0.5 p-1 rounded-full hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                    <Volume2 className="w-3 h-3" />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-foreground">{ex.fr}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ex.en}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conjugations */}
      {result.conjugations && result.wordType?.toLowerCase().includes("verb") && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowConjugations(!showConjugations)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-semibold text-foreground">Conjugations</span>
            {showConjugations ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showConjugations && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(result.conjugations).map(([tense, forms]) => (
                <div key={tense}>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">{TENSE_LABELS[tense] ?? tense}</p>
                  <div className="space-y-1">
                    {(forms as string[]).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <button onClick={() => pronounce(f)} className="p-0.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                          <Volume2 className="w-3 h-3" />
                        </button>
                        <span className="text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Synonyms & Confusing words */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {result.synonyms?.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowSynonyms(!showSynonyms)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">Synonyms</span>
              {showSynonyms ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showSynonyms && (
              <div className="px-4 pb-4 space-y-2">
                {result.synonyms.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button onClick={() => pronounce(s.word)} className="p-0.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                      <Volume2 className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-medium text-foreground">{s.word}</span>
                    <span className="text-xs text-muted-foreground">— {s.meaning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {result.confusingWords?.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowConfusing(!showConfusing)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <span className="text-sm font-semibold text-foreground">Don't confuse with</span>
              {showConfusing ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showConfusing && (
              <div className="px-4 pb-4 space-y-2.5">
                {result.confusingWords.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => pronounce(c.word)} className="p-0.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                        <Volume2 className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-medium text-foreground">{c.word}</span>
                      <span className="text-xs text-muted-foreground">— {c.meaning}</span>
                    </div>
                    {c.difference && <p className="text-xs text-muted-foreground mt-0.5 ml-6 italic">{c.difference}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhraseResult({ result, onAdd }: { result: DictPhraseResult; onAdd: (term: string, translation: string, kind: "word" | "phrase") => void }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-foreground">{result.phrase}</h2>
            <button onClick={() => pronounce(result.phrase)} className="p-1.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary transition-colors">
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          {result.pronunciation && <p className="text-sm text-muted-foreground font-mono">[{result.pronunciation}]</p>}
        </div>
        <button
          onClick={() => onAdd(result.phrase, result.translation, "phrase")}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      <p className="text-lg font-medium text-foreground">{result.translation}</p>
      {result.literalTranslation && (
        <p className="text-sm text-muted-foreground italic">Literal: "{result.literalTranslation}"</p>
      )}
      {result.usage && <p className="text-sm text-muted-foreground">{result.usage}</p>}
      {result.examples?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Examples</p>
          {result.examples.map((ex, i) => (
            <div key={i} className="bg-muted/40 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <button onClick={() => pronounce(ex.fr)} className="mt-0.5 p-1 rounded-full hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                  <Volume2 className="w-3 h-3" />
                </button>
                <div>
                  <p className="text-sm font-medium text-foreground">{ex.fr}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ex.en}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionResult({ result }: { result: DictQuestionResult }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Answer</p>
        <p className="text-foreground">{result.answer}</p>
      </div>
      {result.options?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Related expressions</p>
          <div className="space-y-2">
            {result.options.map((opt, i) => (
              <div key={i} className="bg-muted/40 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => pronounce(opt.french)} className="p-0.5 rounded hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                    <Volume2 className="w-3 h-3" />
                  </button>
                  <span className="text-sm font-semibold text-foreground">{opt.french}</span>
                  <span className="text-xs text-muted-foreground">— {opt.english}</span>
                </div>
                {opt.summary && <p className="text-xs text-muted-foreground ml-6">{opt.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DictionaryTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<DictResult[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const searchMutation = trpc.dictionary.search.useMutation({
    onSuccess: (data) => {
      setResults((prev) => [data as DictResult, ...prev.slice(0, 9)]);
    },
    onError: (err) => toast.error(err.message),
  });

  const addMutation = trpc.vocab.add.useMutation({
    onSuccess: () => {
      toast.success("Added to library!");
      utils.vocab.list.invalidate();
    },
    onError: () => toast.error("Failed to add word"),
  });

  const handleSearch = useCallback(() => {
    const term = searchTerm.trim();
    if (!term) return;
    if (!history.includes(term)) setHistory((prev) => [term, ...prev.slice(0, 19)]);
    searchMutation.mutate({ term });
  }, [searchTerm, history, searchMutation]);

  const handleAdd = (term: string, translation: string, kind: "word" | "phrase") => {
    addMutation.mutate({ term, translation, entryKind: kind });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search header */}
      <div className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={inputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search French words, phrases, or ask a question…"
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchMutation.isPending || !searchTerm.trim()}
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
              {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </button>
          </div>
          {/* History pills */}
          {history.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-none">
              {history.slice(0, 8).map((h) => (
                <button
                  key={h}
                  onClick={() => { setSearchTerm(h); searchMutation.mutate({ term: h }); }}
                  className="flex-shrink-0 px-2.5 py-1 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-full text-xs transition-colors"
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {results.length === 0 && !searchMutation.isPending && (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg font-semibold text-foreground mb-2">Search the French dictionary</p>
              <p className="text-sm text-muted-foreground">Type a word, phrase, or question like "how do I say hello?"</p>
            </div>
          )}
          {searchMutation.isPending && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Looking up…</p>
              </div>
            </div>
          )}
          {results.map((result, i) => (
            <div key={i}>
              {result.type === "word" && <WordResult result={result as DictWordResult} onAdd={handleAdd} />}
              {result.type === "phrase" && <PhraseResult result={result as DictPhraseResult} onAdd={handleAdd} />}
              {result.type === "question" && <QuestionResult result={result as DictQuestionResult} />}
              {result.type === "error" && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
                  {(result as any).message}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
