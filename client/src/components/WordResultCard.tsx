/**
 * WordResultCard — shared, read-only dictionary word card used by the search
 * drawer (and available for reuse elsewhere).
 *
 * Renders the essential fields immediately (meaning, examples, de/à preposition,
 * reflexive info) and the "heavy" fields (conjugations, synonyms, confusing
 * words) in collapsible sections. Those sections show a spinner while
 * `detailsLoading` is true, so the card can paint before the details arrive.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronUp, Plus, Loader2, RefreshCw, BookmarkCheck,
} from "lucide-react";
import type { DictWordResult } from "@/types";
import type { PronounceState } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";

const TENSE_LABELS: Record<string, string> = {
  present: "Présent",
  imparfait: "Imparfait",
  passeCompose: "Passé Composé",
  futurSimple: "Futur Simple",
  conditionnel: "Conditionnel",
  subjonctif: "Subjonctif",
};

export function WordResultCard({
  result,
  detailsLoading,
  onAdd,
  isAdded,
  adding,
  speak,
  pronounceState,
  activeText,
}: {
  result: DictWordResult;
  detailsLoading: boolean;
  onAdd?: () => void;
  isAdded?: boolean;
  adding?: boolean;
  speak: (text: string) => void;
  pronounceState: PronounceState;
  activeText: string | null;
}) {
  const [showConjugations, setShowConjugations] = useState(false);
  const [showSynonyms, setShowSynonyms] = useState(false);
  const [showConfusing, setShowConfusing] = useState(false);

  if (!result.found) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">No dictionary entry found.</p>
      </div>
    );
  }

  const isVerb = result.wordType?.toLowerCase().includes("verb");
  const hasConjugations = Object.values(result.conjugations ?? {}).some((a) => (a as string[])?.length);
  const showConjSection = isVerb && (hasConjugations || detailsLoading);
  const showSynSection = (result.synonyms?.length ?? 0) > 0 || detailsLoading;
  const showConfSection = (result.confusingWords?.length ?? 0) > 0 || detailsLoading;

  return (
    <div className="space-y-3">
      {/* Main card */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold text-foreground">{result.word}</h2>
              <PronounceButton text={result.word} speak={speak} state={pronounceState} activeText={activeText} className="p-1.5 bg-primary/15 hover:bg-primary/25 text-primary" iconSize="w-4 h-4" />
            </div>
            {result.pronunciation && <p className="text-sm text-muted-foreground font-mono">[{result.pronunciation}]</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {result.wordType && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary font-semibold capitalize">{result.wordType}</span>
            )}
            {(result.isReflexive || result.hasReflexiveForm) && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                {result.isReflexive ? "reflexive" : "has reflexive"}
              </span>
            )}
            {onAdd && (
              <button
                onClick={onAdd}
                disabled={isAdded || adding}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  isAdded ? "bg-emerald-500/15 text-emerald-400 cursor-default" : "bg-primary/15 hover:bg-primary/25 text-primary"
                )}
              >
                {isAdded ? <><BookmarkCheck className="w-3.5 h-3.5" /> Saved</> : adding ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
              </button>
            )}
          </div>
        </div>

        <p className="text-lg text-foreground font-medium mb-3">{result.translation}</p>

        {result.isConjugated && result.baseForm && (
          <div className="bg-muted/50 rounded-xl p-3 mb-3 text-sm">
            <span className="text-muted-foreground">Base form: </span>
            <span className="text-primary font-semibold">{result.baseForm}</span>
            {result.formExplanation && <span className="text-muted-foreground"> — {result.formExplanation}</span>}
          </div>
        )}

        {/* Reflexive banner */}
        {(result.isReflexive || result.hasReflexiveForm) && (
          <div className="border border-amber-500/40 bg-amber-500/10 rounded-xl p-3 mb-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-bold text-amber-300">
                {result.isReflexive ? "Reflexive verb (pronominal)" : "Has a reflexive form"}
              </span>
            </div>
            {(result.reflexiveForm || result.nonReflexiveForm) && (
              <p className="text-sm text-foreground">
                {result.nonReflexiveForm && <span className="font-semibold">{result.nonReflexiveForm}</span>}
                {result.reflexiveForm && result.nonReflexiveForm && <span className="text-muted-foreground"> → </span>}
                {result.reflexiveForm && <span className="font-bold text-amber-300">{result.reflexiveForm}</span>}
              </p>
            )}
            {result.reflexiveExplanation && <p className="text-sm text-amber-100/80 leading-relaxed">{result.reflexiveExplanation}</p>}
          </div>
        )}

        {/* Governed preposition */}
        {result.governedPreposition && (
          <div className="border border-sky-500/40 bg-sky-500/10 rounded-xl p-3 mb-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-xs font-bold text-sky-300 uppercase tracking-wide">Preposition</span>
              <span className="font-semibold text-foreground">{result.word}</span>
              <span className="px-2 py-0.5 rounded-full bg-sky-500/25 text-sky-200 font-bold">{result.governedPreposition}</span>
              <span className="text-muted-foreground">+ complement</span>
            </div>
            {result.prepositionExplanation && <p className="text-sm text-sky-100/80 leading-relaxed">{result.prepositionExplanation}</p>}
          </div>
        )}

        {/* Adjective / state auxiliary — avoir vs être */}
        {result.adjectiveAuxiliary && (
          <div className="border border-violet-500/40 bg-violet-500/10 rounded-xl p-3 mb-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-xs font-bold text-violet-300 uppercase tracking-wide">Auxiliary</span>
              <span className="px-2 py-0.5 rounded-full bg-violet-500/25 text-violet-200 font-bold">{result.adjectiveAuxiliary}</span>
              <span className="text-muted-foreground">+ {result.word}</span>
            </div>
            {result.adjectiveAuxiliaryExplanation && <p className="text-sm text-violet-100/80 leading-relaxed">{result.adjectiveAuxiliaryExplanation}</p>}
          </div>
        )}

        {result.grammar && <p className="text-sm text-muted-foreground italic mb-3">{result.grammar}</p>}

        {result.examples?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Examples</p>
            {result.examples.map((ex, i) => (
              <div key={i} className="bg-muted/40 rounded-xl p-3 flex items-start gap-2">
                <PronounceButton text={ex.fr} speak={speak} state={pronounceState} activeText={activeText} className="mt-0.5 p-1 hover:bg-primary/15 text-muted-foreground hover:text-primary shrink-0" iconSize="w-3 h-3" />
                <div>
                  <p className="text-sm font-medium text-foreground">{ex.fr}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ex.en}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conjugations (folded; loads in background) */}
      {showConjSection && (
        <FoldSection
          title="Conjugations"
          open={showConjugations}
          onToggle={() => setShowConjugations((s) => !s)}
          loading={detailsLoading && !hasConjugations}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(result.conjugations).filter(([, forms]) => (forms as string[])?.length).map(([tense, forms]) => (
              <div key={tense}>
                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">{TENSE_LABELS[tense] ?? tense}</p>
                <div className="space-y-1">
                  {(forms as string[]).map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <PronounceButton text={f} speak={speak} state={pronounceState} activeText={activeText} className="p-0.5 hover:bg-primary/15 text-muted-foreground hover:text-primary" iconSize="w-3 h-3" />
                      <span className="text-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FoldSection>
      )}

      {/* Synonyms & Confusing words */}
      {showSynSection && (
        <FoldSection title="Synonyms" open={showSynonyms} onToggle={() => setShowSynonyms((s) => !s)} loading={detailsLoading && !(result.synonyms?.length)}>
          <div className="space-y-2">
            {result.synonyms.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <PronounceButton text={s.word} speak={speak} state={pronounceState} activeText={activeText} className="p-0.5 hover:bg-primary/15 text-muted-foreground hover:text-primary" iconSize="w-3 h-3" />
                <span className="text-sm font-medium text-foreground">{s.word}</span>
                <span className="text-xs text-muted-foreground">— {s.meaning}</span>
              </div>
            ))}
          </div>
        </FoldSection>
      )}

      {showConfSection && (
        <FoldSection title="Confusing words" open={showConfusing} onToggle={() => setShowConfusing((s) => !s)} loading={detailsLoading && !(result.confusingWords?.length)}>
          <div className="space-y-2">
            {result.confusingWords.map((c, i) => (
              <div key={i}>
                <span className="text-sm font-medium text-foreground">{c.word}</span>
                <span className="text-xs text-muted-foreground"> — {c.meaning}</span>
                {c.difference && <p className="text-xs text-muted-foreground italic mt-0.5">{c.difference}</p>}
              </div>
            ))}
          </div>
        </FoldSection>
      )}
    </div>
  );
}

function FoldSection({ title, open, onToggle, loading, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          {title}
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : children}
        </div>
      )}
    </div>
  );
}
