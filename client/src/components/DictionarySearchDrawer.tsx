/**
 * DictionarySearchDrawer — a right-side dictionary lookup panel usable from the
 * Flashcard, Grammar Test, and Quiz tabs. Reuses the two-phase progressive
 * lookup so essentials paint fast and the folded sections fill in the
 * background. Words can be saved straight into the vocab library.
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Search, X, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { DictWordResult, DictPhraseResult, DictQuestionResult } from "@/types";
import { usePronounce } from "@/lib/pronounce";
import { useProgressiveDictionary } from "@/lib/useProgressiveDictionary";
import { WordResultCard } from "@/components/WordResultCard";
import { PronounceButton } from "@/components/PronounceButton";

/** Floating button that opens the dictionary drawer. Renders only when closed. */
export function DictionaryFab({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  if (open) return null;
  return (
    <button
      onClick={onOpen}
      title="Open dictionary"
      className="fixed bottom-20 right-4 z-30 flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-3.5 pr-4 py-2.5 shadow-lg hover:bg-primary/90 transition-colors"
    >
      <Search className="w-4 h-4" />
      <span className="text-sm font-semibold">Dictionary</span>
    </button>
  );
}

export function DictionarySearchDrawer({ open, onClose, initialTerm }: {
  open: boolean;
  onClose: () => void;
  initialTerm?: string;
}) {
  const { speak, state: pronounceState, activeText } = usePronounce();
  const { search, reset, result, quickLoading, detailsLoading } = useProgressiveDictionary();
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const addVocab = trpc.vocab.add.useMutation();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const { data: vocabList = [] } = trpc.vocab.list.useQuery();

  // When the drawer opens: focus the input and, if a term was provided, run it.
  useEffect(() => {
    if (!open) return;
    setTerm(initialTerm ?? "");
    if (initialTerm?.trim()) void search(initialTerm.trim());
    else reset();
    setTimeout(() => inputRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTerm]);

  if (!open) return null;

  const runSearch = () => { if (term.trim()) void search(term.trim()); };

  const norm = (s: string) => s.trim().toLowerCase();
  const wordResult = result?.type === "word" ? (result as DictWordResult) : null;
  const savedKey = wordResult ? norm(wordResult.word) : "";
  const isSaved = !!savedKey && (saved.has(savedKey) || vocabList.some((v) => norm(v.term) === savedKey));

  const addWord = async () => {
    if (!wordResult?.found || addVocab.isPending) return;
    if (isSaved) { setSaved((s) => new Set(s).add(savedKey)); return; }
    try {
      await addVocab.mutateAsync({ term: wordResult.word, translation: wordResult.translation, entryKind: "word", lessonSource: "Dictionary" });
      setSaved((s) => new Set(s).add(savedKey));
      utils.vocab.list.invalidate();
      toast.success(`Saved “${wordResult.word}” to your library`);
    } catch {
      toast.error("Couldn't save the word");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-[92%] max-w-md bg-background border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Dictionary</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border shrink-0 flex gap-2">
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search a French or English word…"
            className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
          <button
            onClick={runSearch}
            disabled={quickLoading || !term.trim()}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold text-sm transition-colors flex items-center"
          >
            {quickLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Go"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {quickLoading && !result && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
            </div>
          )}

          {!quickLoading && !result && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Search any word to see its meaning, examples, and grammar.
            </p>
          )}

          {wordResult && (
            <WordResultCard
              result={wordResult}
              detailsLoading={detailsLoading}
              onAdd={addWord}
              isAdded={isSaved}
              adding={addVocab.isPending}
              speak={speak}
              pronounceState={pronounceState}
              activeText={activeText}
            />
          )}

          {result?.type === "phrase" && (result as DictPhraseResult).found && (
            <PhraseCard result={result as DictPhraseResult} speak={speak} pronounceState={pronounceState} activeText={activeText} />
          )}

          {result?.type === "question" && (
            <QuestionCard result={result as DictQuestionResult} />
          )}

          {result && ((result.type === "word" && !(result as DictWordResult).found) || (result.type === "phrase" && !(result as DictPhraseResult).found)) && (
            <p className="text-sm text-muted-foreground text-center py-8">No entry found for that.</p>
          )}
        </div>
      </aside>
    </>
  );
}

function PhraseCard({ result, speak, pronounceState, activeText }: {
  result: DictPhraseResult;
  speak: (t: string) => void;
  pronounceState: import("@/lib/pronounce").PronounceState;
  activeText: string | null;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold text-foreground">{result.phrase}</h2>
        <PronounceButton text={result.phrase} speak={speak} state={pronounceState} activeText={activeText} className="p-1.5 bg-primary/15 hover:bg-primary/25 text-primary" iconSize="w-4 h-4" />
      </div>
      {result.pronunciation && <p className="text-sm text-muted-foreground font-mono">[{result.pronunciation}]</p>}
      <p className="text-lg text-foreground font-medium">{result.translation}</p>
      {result.literalTranslation && <p className="text-sm text-muted-foreground">Literal: {result.literalTranslation}</p>}
      {result.usage && <p className="text-sm text-muted-foreground italic">{result.usage}</p>}
      {result.examples?.length > 0 && (
        <div className="space-y-2">
          {result.examples.map((ex, i) => (
            <div key={i} className="bg-muted/40 rounded-xl p-3 flex items-start gap-2">
              <PronounceButton text={ex.fr} speak={speak} state={pronounceState} activeText={activeText} className="mt-0.5 p-1 text-muted-foreground hover:text-primary shrink-0" iconSize="w-3 h-3" />
              <div>
                <p className="text-sm font-medium text-foreground">{ex.fr}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ex.en}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ result }: { result: DictQuestionResult }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <p className="text-sm font-semibold text-foreground">{result.question}</p>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{result.answer}</p>
      {result.options?.length > 0 && (
        <div className="space-y-2">
          {result.options.map((o, i) => (
            <div key={i} className="bg-muted/40 rounded-xl p-3 flex items-start gap-2">
              <Volume2 className="w-3 h-3 mt-1 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{o.french}</p>
                <p className="text-xs text-muted-foreground">{o.english}{o.summary ? ` — ${o.summary}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
