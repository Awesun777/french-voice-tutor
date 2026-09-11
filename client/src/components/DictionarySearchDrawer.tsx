/**
 * DictionarySearchDrawer — a right-side dictionary lookup panel usable from the
 * Flashcard, Grammar Test, and Quiz tabs. Reuses the two-phase progressive
 * lookup so essentials paint fast and the folded sections fill in the
 * background. Words can be saved straight into the vocab library.
 */
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Search, X, Loader2, Volume2, Plus, BookmarkCheck, BookOpen, MessageCircle } from "lucide-react";
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
      className="fixed bottom-20 right-4 z-30 hidden sm:flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-3.5 pr-4 py-2.5 shadow-lg hover:bg-primary/90 transition-colors"
    >
      <Search className="w-4 h-4" />
      <span className="text-sm font-semibold">Dictionary</span>
    </button>
  );
}

export function DictionarySearchDrawer({ open, onClose, initialTerm, contextSentence }: {
  open: boolean;
  onClose: () => void;
  initialTerm?: string;
  /** Sentence the highlighted term was found in — enables "In this context". */
  contextSentence?: string;
}) {
  const { speak, preload, state: pronounceState, activeText } = usePronounce();
  const { search, reset, result, quickLoading, detailsLoading } = useProgressiveDictionary();
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // "dictionary" looks the query up; "tutor" sends it to the tutor as a free
  // question. Tab flips modes, as does clicking the header labels.
  const [mode, setMode] = useState<"dictionary" | "tutor">("dictionary");
  const [tutorThread, setTutorThread] = useState<{ q: string; a: string | null }[]>([]);
  const tutorAsk = trpc.tutor.contextChat.useMutation();
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Disambiguation hints (same controls as the Dictionary tab): word type +
  // input language, behind the book button inside the search bar.
  const [typeHint, setTypeHint] = useState<"" | "noun" | "adjective" | "adverb" | "verb">("");
  const [langHint, setLangHint] = useState<"" | "fr" | "en">("");
  const [hintsOpen, setHintsOpen] = useState(false);
  const hintsActive = !!(typeHint || langHint);

  /**
   * "In this context" — what the highlighted word means in the very sentence
   * it was selected from, mirroring the browser extension. Only for the seeded
   * (highlighted) search: a fresh term typed into the box has left the page's
   * sentence behind, so the analysis stops applying and disappears.
   */
  const [searchedTerm, setSearchedTerm] = useState<string | null>(null);
  const [ctxNote, setCtxNote] = useState<string | null>(null);
  const ctxRequestedFor = useRef<string | null>(null);
  const contextChat = trpc.tutor.contextChat.useMutation();
  const ctxEligible =
    !!contextSentence &&
    !!initialTerm &&
    !!searchedTerm &&
    searchedTerm.trim().toLowerCase() === initialTerm.trim().toLowerCase();

  // Escape closes, as expected of a palette-style overlay. Bound only while
  // open so it never competes with other Escape handlers on the page.
  //
  // Ctrl/Cmd+A selects the query rather than the page behind the drawer. The
  // drawer floats over whatever you were reading, so without this the shortcut
  // reaches the article underneath and selects a whole transcript — which is
  // never what someone means while a search box is open. The drawer has exactly
  // one text field, so this can select unconditionally rather than trying to
  // guess whether focus is somewhere it should be left alone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Tab flips between looking a word up and asking the tutor. The drawer
      // has a single text field, so focus cycling loses nothing.
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setMode((m) => (m === "dictionary" ? "tutor" : "dictionary"));
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const utils = trpc.useUtils();
  const addVocab = trpc.vocab.add.useMutation();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const { data: vocabList = [] } = trpc.vocab.list.useQuery();

  // A fresh tutor exchange scrolls into view as the reply streams in.
  useEffect(() => {
    if (mode === "tutor") threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [tutorThread, mode]);

  // When the drawer opens: focus the input and, if a term was provided, run it.
  useEffect(() => {
    if (!open) return;
    setMode("dictionary");
    setTutorThread([]);
    setHintsOpen(false);
    setTerm(initialTerm ?? "");
    setSearchedTerm(initialTerm?.trim() || null);
    setCtxNote(null);
    ctxRequestedFor.current = null;
    if (initialTerm?.trim()) void search(initialTerm.trim());
    else reset();
    setTimeout(() => inputRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTerm]);

  // Preload the looked-up word's pronunciation so tapping speak is instant.
  useEffect(() => {
    if (result?.type === "word" && (result as DictWordResult).found) {
      void preload((result as DictWordResult).word);
    }
  }, [result, preload]);

  // Once the seeded search resolves to a real entry, ask what the word is doing
  // in its sentence. The ref guards strict-mode double-fires and re-renders —
  // one analysis per drawer opening.
  useEffect(() => {
    if (!ctxEligible || !contextSentence || !initialTerm) return;
    const found =
      (result?.type === "word" && (result as DictWordResult).found) ||
      (result?.type === "phrase" && (result as DictPhraseResult).found);
    if (!found) return;
    const key = initialTerm.trim().toLowerCase();
    if (ctxRequestedFor.current === key) return;
    ctxRequestedFor.current = key;

    const headword = result?.type === "word" ? (result as DictWordResult).word : (result as DictPhraseResult).phrase;
    contextChat.mutate(
      {
        message: `In 2-3 sentences of plain prose, explain what "${headword}" means in this sentence and how it functions there: "${contextSentence}". Talk about "${headword}" ONLY — do NOT translate, analyze, or break down the rest of the sentence, and never go word by word. No bullets, no lists, no headings.`.slice(0, 2000),
        vocabContext: {
          term: headword,
          translation:
            result?.type === "word" ? (result as DictWordResult).translation : (result as DictPhraseResult).translation,
        },
      },
      {
        onSuccess: (r) => setCtxNote(r.reply),
        onError: () => setCtxNote("Couldn't analyze this sentence."),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, ctxEligible, contextSentence, initialTerm]);

  if (!open) return null;

  const runSearch = () => {
    if (!term.trim()) return;
    if (mode === "tutor") {
      const q = term.trim().slice(0, 2000);
      setTerm("");
      setTutorThread((t) => [...t, { q, a: null }]);
      tutorAsk.mutate({ message: q }, {
        onSuccess: (r) => setTutorThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, a: r.reply } : m))),
        onError: () => setTutorThread((t) => t.map((m, i) => (i === t.length - 1 ? { ...m, a: "Couldn't reach the tutor — try again." } : m))),
      });
      return;
    }
    setSearchedTerm(term.trim());
    void search(term.trim(), {
      ...(typeHint ? { wordTypeHint: typeHint } : {}),
      ...(langHint ? { langHint } : {}),
    });
  };

  const norm = (s: string) => s.trim().toLowerCase();
  const wordResult = result?.type === "word" ? (result as DictWordResult) : null;
  const phraseResult = result?.type === "phrase" ? (result as DictPhraseResult) : null;

  /**
   * What the current result would save as. Phrases are as worth keeping as
   * single words — more so, since the ⌘-style shortcut pre-fills from the page
   * selection and a dragged selection is usually several words.
   */
  const savable: { term: string; translation: string; entryKind: "word" | "phrase" } | null =
    wordResult?.found
      ? { term: wordResult.word, translation: wordResult.translation, entryKind: "word" }
      : phraseResult?.found
        ? { term: phraseResult.phrase, translation: phraseResult.translation, entryKind: "phrase" }
        : null;

  const savedKey = savable ? norm(savable.term) : "";
  // Checked against the library as well as this session's saves, so re-searching
  // something saved weeks ago still comes back marked.
  const isSaved = !!savedKey && (saved.has(savedKey) || vocabList.some((v) => norm(v.term) === savedKey));

  const addCurrent = async () => {
    if (!savable || addVocab.isPending) return;
    if (isSaved) { setSaved((s) => new Set(s).add(savedKey)); return; }
    // Optimistic: mark saved NOW; the insert runs in the background and only
    // an actual failure reverts the tick.
    setSaved((s) => new Set(s).add(savedKey));
    try {
      await addVocab.mutateAsync({ ...savable, lessonSource: "Dictionary" });
      utils.vocab.list.invalidate();
    } catch {
      setSaved((s) => { const next = new Set(s); next.delete(savedKey); return next; });
      toast.error(`Couldn't save the ${savable.entryKind} — try again`);
    }
  };

  return (
    <>
      {/* Backdrop dims and blurs the page so the panel reads as a layer above
          it rather than another region of the page. */}
      <div
        className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />
      {/* Rises from the bottom, centred and floating clear of the edge — a
          command-palette shape rather than a docked side panel. */}
      <aside className="fixed z-50 inset-x-0 bottom-0 sm:bottom-6 flex justify-center px-0 sm:px-4 pointer-events-none">
      <div className="pointer-events-auto w-full sm:max-w-2xl max-h-[76vh] flex flex-col bg-popover rounded-t-3xl sm:rounded-3xl ring-1 ring-black/5 shadow-[0_24px_60px_-12px_rgb(23_63_107_/_0.45)] animate-in fade-in slide-in-from-bottom-8 duration-200 ease-out overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-1 shrink-0">
          {/* Mode toggle — click either label, or press Tab, to switch. */}
          <button
            onClick={() => setMode("dictionary")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold transition-colors",
              mode === "dictionary" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Search className="w-4 h-4" /> Dictionary
          </button>
          <button
            onClick={() => setMode("tutor")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold transition-colors",
              mode === "tutor" ? "bg-speaking/10 text-speaking" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageCircle className="w-4 h-4" /> Ask tutor
          </button>
          <span className="flex-1" />
          <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground" title="Switch mode">tab</kbd>
          <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">esc</kbd>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 shrink-0 flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder={mode === "tutor" ? "Ask the tutor anything about French…" : "Search a French or English word…"}
              className={cn(
                "w-full px-3.5 py-2.5 rounded-xl bg-muted/50 text-foreground placeholder-muted-foreground text-base focus:outline-none focus:ring-2 transition-shadow",
                mode === "tutor" ? "focus:ring-speaking/40" : "focus:ring-primary/40 pr-11"
              )}
            />
            {/* Word-type / language hints live inside the bar, dictionary
                mode only — same controls as the Dictionary tab's picker. */}
            {mode === "dictionary" && (
              <button
                onClick={() => setHintsOpen((o) => !o)}
                aria-expanded={hintsOpen}
                title="Specify word type / language"
                className={cn(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors",
                  hintsActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <BookOpen className="w-4 h-4" />
                {hintsActive && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            )}
            {hintsOpen && mode === "dictionary" && (
              <>
                {/* click-away catcher */}
                <div className="fixed inset-0 z-20" onClick={() => setHintsOpen(false)} />
                <div className="absolute right-0 bottom-[calc(100%+8px)] z-30 w-64 rounded-2xl bg-popover p-3.5 shadow-[0_12px_32px_-8px_rgb(23_63_107_/_0.35)] ring-1 ring-black/5 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Word type</p>
                    <div className="flex flex-wrap gap-1">
                      {([["", "Any"], ["noun", "Noun"], ["adjective", "Adj"], ["adverb", "Adv"], ["verb", "Verb"]] as const).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setTypeHint(v)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                            typeHint === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Input language</p>
                    <div className="flex gap-1">
                      {([["", "Auto"], ["fr", "French"], ["en", "English"]] as const).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setLangHint(v)}
                          className={cn(
                            "flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                            langHint === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Helps with same-spelling words — «ferme» as noun vs verb, or "pain" in English vs French.
                  </p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={runSearch}
            disabled={(mode === "dictionary" ? quickLoading : tutorAsk.isPending) || !term.trim()}
            className={cn(
              "px-4 py-2.5 rounded-xl disabled:opacity-50 text-primary-foreground font-semibold text-sm transition-colors flex items-center",
              mode === "tutor" ? "bg-speaking hover:bg-speaking/90" : "bg-primary hover:bg-primary/90"
            )}
          >
            {mode === "tutor"
              ? (tutorAsk.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask")
              : (quickLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Go")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {mode === "tutor" && (
            <div className="space-y-3">
              {tutorThread.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask anything about French — grammar, nuance, when to use a word, how to say something…
                </p>
              )}
              {tutorThread.map((m, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm font-semibold text-speaking bg-speaking/10 rounded-xl px-3.5 py-2 w-fit max-w-[85%] ml-auto">{m.q}</p>
                  <div className="bg-card card-float rounded-2xl p-4">
                    {m.a === null ? (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                      </span>
                    ) : (
                      <div className="prose prose-sm max-w-none text-sm text-foreground leading-relaxed">
                        <Streamdown>{m.a}</Streamdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
          )}

          {mode === "dictionary" && quickLoading && !result && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
            </div>
          )}

          {mode === "dictionary" && <>
          {!quickLoading && !result && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Search any word to see its meaning, examples, and grammar.
            </p>
          )}

          {wordResult && (
            <WordResultCard
              result={wordResult}
              detailsLoading={detailsLoading}
              onAdd={addCurrent}
              isAdded={isSaved}
              adding={addVocab.isPending}
              speak={speak}
              pronounceState={pronounceState}
              activeText={activeText}
            />
          )}

          {result?.type === "phrase" && (result as DictPhraseResult).found && (
            <PhraseCard
              result={result as DictPhraseResult}
              speak={speak}
              pronounceState={pronounceState}
              activeText={activeText}
              onAdd={addCurrent}
              isAdded={isSaved}
              adding={addVocab.isPending}
            />
          )}

          {result?.type === "question" && (
            <QuestionCard result={result as DictQuestionResult} />
          )}

          {ctxEligible && (wordResult?.found || phraseResult?.found) && (
            <div className="bg-card card-float rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-speaking mb-1">In this context</p>
              <p className="text-xs text-muted-foreground italic mb-2 line-clamp-2">“{contextSentence}”</p>
              {ctxNote ? (
                <div className="prose prose-sm max-w-none text-sm text-foreground leading-relaxed">
                  <Streamdown>{ctxNote}</Streamdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Reading the sentence…</p>
              )}
            </div>
          )}

          {result && ((result.type === "word" && !(result as DictWordResult).found) || (result.type === "phrase" && !(result as DictPhraseResult).found)) && (
            <p className="text-sm text-muted-foreground text-center py-8">No entry found for that.</p>
          )}
          </>}
        </div>
      </div>
      </aside>
    </>
  );
}

function PhraseCard({ result, speak, pronounceState, activeText, onAdd, isAdded, adding }: {
  result: DictPhraseResult;
  speak: (t: string) => void;
  pronounceState: import("@/lib/pronounce").PronounceState;
  activeText: string | null;
  onAdd?: () => void;
  isAdded?: boolean;
  adding?: boolean;
}) {
  return (
    <div className="bg-card card-float rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-bold text-foreground">{result.phrase}</h2>
        <PronounceButton text={result.phrase} speak={speak} state={pronounceState} activeText={activeText} className="p-1.5 bg-primary/15 hover:bg-primary/25 text-primary" iconSize="w-4 h-4" />
        {/* Same control as WordResultCard, so both result types behave alike. */}
        {onAdd && (
          <button
            onClick={onAdd}
            disabled={isAdded || adding}
            className={cn(
              "ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0",
              isAdded ? "bg-emerald-500/15 text-emerald-700 cursor-default" : "bg-primary/15 hover:bg-primary/25 text-primary"
            )}
          >
            {isAdded ? <><BookmarkCheck className="w-3.5 h-3.5" /> Saved</> : adding ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
        )}
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
    <div className="bg-card card-float rounded-2xl p-5 space-y-3">
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
