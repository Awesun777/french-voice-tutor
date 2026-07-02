/**
 * useProgressiveDictionary — two-phase dictionary lookup.
 *
 * Phase 1 (`search`, parts:"quick") returns the essentials (meaning, examples,
 * de/à, reflexive) fast. For a found word we then fetch the heavy fields
 * (conjugations/synonyms/confusing) in the background and merge them in, so the
 * folded sections fill without blocking the first paint.
 */
import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import type { DictResult, DictWordResult, DictWordDetails } from "@/types";

const EMPTY_CONJ: DictWordResult["conjugations"] = {
  present: [], imparfait: [], passeCompose: [], futurSimple: [], conditionnel: [], subjonctif: [],
};

export function useProgressiveDictionary() {
  const searchMutation = trpc.dictionary.search.useMutation();
  const detailsMutation = trpc.dictionary.searchDetails.useMutation();
  const [result, setResult] = useState<DictResult | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const reqRef = useRef(0);

  const search = useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) return;
    const reqId = ++reqRef.current;
    setResult(null);
    setDetailsLoading(false);
    setQuickLoading(true);
    try {
      const quick = (await searchMutation.mutateAsync({ term: t, parts: "quick" })) as DictResult & { found?: boolean; word?: string };
      if (reqRef.current !== reqId) return;
      // Ensure the heavy fields exist so the card renders before details arrive.
      const withDefaults: DictResult = quick?.type === "word"
        ? { ...(quick as DictWordResult), conjugations: (quick as DictWordResult).conjugations ?? EMPTY_CONJ, synonyms: (quick as DictWordResult).synonyms ?? [], confusingWords: (quick as DictWordResult).confusingWords ?? [] }
        : quick;
      setResult(withDefaults);
      setQuickLoading(false);

      if (quick?.type === "word" && (quick as DictWordResult).found) {
        setDetailsLoading(true);
        try {
          const details = (await detailsMutation.mutateAsync({ word: (quick as DictWordResult).word })) as DictWordDetails;
          if (reqRef.current !== reqId) return;
          setResult((prev) =>
            prev && prev.type === "word"
              ? { ...prev, conjugations: details.conjugations ?? EMPTY_CONJ, synonyms: details.synonyms ?? [], confusingWords: details.confusingWords ?? [] }
              : prev
          );
        } finally {
          if (reqRef.current === reqId) setDetailsLoading(false);
        }
      }
    } catch {
      if (reqRef.current === reqId) { setQuickLoading(false); setDetailsLoading(false); }
    }
  }, [searchMutation, detailsMutation]);

  const reset = useCallback(() => {
    reqRef.current++;
    setResult(null);
    setQuickLoading(false);
    setDetailsLoading(false);
  }, []);

  return { search, reset, result, quickLoading, detailsLoading };
}
