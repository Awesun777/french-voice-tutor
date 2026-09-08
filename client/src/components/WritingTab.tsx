/**
 * WritingTab (admin) — a French writing pad with proofreading.
 *
 * Write in the big textarea (no accent keyboard needed — a floating accent
 * pad sits on the right, and the checker restores missing accents anyway),
 * press Check (or ⌘/Ctrl+Enter), and the corrections come back as a full
 * corrected text plus per-fix chips, with accent restorations called out —
 * the author types on an English keyboard, so those are the common case.
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, PenLine, Check, Copy, ArrowDown, Sparkles } from "lucide-react";

const ACCENTS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "œ", "ù", "û", "ü", "É", "À", "Ç", "«", "»", "’"];

const KIND_STYLE: Record<string, { chip: string; label: string }> = {
  accent:   { chip: "bg-sky-500/15 text-sky-800",     label: "accent" },
  grammar:  { chip: "bg-amber-500/15 text-amber-800", label: "grammar" },
  spelling: { chip: "bg-rose-500/15 text-rose-800",   label: "spelling" },
};

interface Fix { before: string; after: string; kind: "accent" | "grammar" | "spelling"; note: string }

export default function WritingTab() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ corrected: string; fixes: Fix[]; checkedText: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const checkMutation = trpc.writing.check.useMutation({
    // An LLM call that takes seconds — never let it share an HTTP batch.
    trpc: { context: { skipBatch: true } },
    onSuccess: (data, vars) => setResult({ ...data, checkedText: vars.text }),
    onError: (e) => toast.error(e.message || "Check failed — try again"),
  });

  const runCheck = () => {
    const t = text.trim();
    if (!t || checkMutation.isPending) return;
    checkMutation.mutate({ text: t });
  };

  /** Insert an accent character at the caret, keeping focus in the textarea. */
  const insert = (ch: string) => {
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    if (!document.execCommand("insertText", false, ch)) {
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      setText(text.slice(0, start) + ch + text.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + ch.length, start + ch.length);
      });
    }
  };

  const applyCorrected = () => {
    if (!result) return;
    setText(result.corrected);
    areaRef.current?.focus();
  };

  const copyCorrected = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.corrected);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const stale = result !== null && result.checkedText !== text.trim();
  const clean = result !== null && !stale && result.fixes.length === 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4 lg:pr-24">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PenLine className="w-6 h-6 text-primary" /> Writing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Write in French — accents optional. Check restores them and fixes grammar, keeping your wording.
          </p>
        </div>

        <div className="bg-card card-float rounded-2xl p-4 space-y-3">
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runCheck(); }
              // Keep keystrokes out of the app's global shortcuts.
              e.stopPropagation();
            }}
            placeholder="Ecris ton texte ici… (les accents peuvent manquer — le correcteur les restaure)"
            rows={8}
            className="w-full resize-y min-h-40 px-3.5 py-3 rounded-xl bg-background border border-border text-[15px] leading-7 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground tabular-nums">{text.length} / 4000</p>
            <button
              onClick={runCheck}
              disabled={!text.trim() || checkMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-bold transition-colors flex items-center gap-2"
            >
              {checkMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
                : <><Sparkles className="w-4 h-4" /> Check</>}
            </button>
          </div>
        </div>

        {clean && (
          <div className="rounded-2xl border border-emerald-300/60 bg-emerald-500/10 p-4 flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Check className="w-4 h-4" /> No corrections needed — c'est parfait !
          </div>
        )}

        {result && result.fixes.length > 0 && (
          <>
            <div className={cn("bg-card card-float rounded-2xl p-4 space-y-3", stale && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Corrected{stale ? " (from an earlier version of the text)" : ""}
                </p>
                <div className="flex gap-1.5">
                  <button onClick={copyCorrected} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                  <button onClick={applyCorrected} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-xs font-semibold text-primary transition-colors">
                    <ArrowDown className="w-3.5 h-3.5" /> Use this
                  </button>
                </div>
              </div>
              <p className="text-[15px] leading-7 text-foreground whitespace-pre-wrap">{result.corrected}</p>
            </div>

            <div className="space-y-2">
              <p className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {result.fixes.length} fix{result.fixes.length === 1 ? "" : "es"}
                {result.fixes.some((f) => f.kind === "accent") &&
                  ` · ${result.fixes.filter((f) => f.kind === "accent").length} accent${result.fixes.filter((f) => f.kind === "accent").length === 1 ? "" : "s"}`}
              </p>
              {result.fixes.map((f, i) => (
                <div key={i} className="bg-card card-float rounded-xl p-3.5 flex items-start gap-3">
                  <span className={cn("flex-shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", (KIND_STYLE[f.kind] ?? KIND_STYLE.grammar).chip)}>
                    {(KIND_STYLE[f.kind] ?? KIND_STYLE.grammar).label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="text-rose-700 line-through decoration-rose-400/70">{f.before}</span>
                      <span className="text-muted-foreground mx-1.5">→</span>
                      <span className="font-semibold text-emerald-800">{f.after}</span>
                    </p>
                    {f.note && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Floating accent pad — always within thumb's reach on the right, so an
          English keyboard can still type proper French by hand. Inserts at the
          caret; mousedown is swallowed so the textarea keeps focus. */}
      <div className="hidden md:flex flex-col gap-1 fixed right-3 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-2xl bg-card card-float border border-border max-h-[80vh] overflow-y-auto scrollbar-none">
        {ACCENTS.map((ch) => (
          <button
            key={ch}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(ch)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-muted/60 hover:bg-primary/15 hover:text-primary text-foreground text-base font-medium transition-colors"
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}
