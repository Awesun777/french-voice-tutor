/**
 * WritingTab (admin) — a journal-style French writing pad.
 *
 * Two panes, modelled on the classic notes-app layout: an entries rail on the
 * left (title + snippet, accent bar on the active entry) and a spacious
 * editor filling the rest. Entries autosave as you type.
 *
 * Proofreading is LIVE: a few seconds after you pause, the checker runs and
 * pending fixes appear in a bar docked under the editor — accents first,
 * since the author types on an English keyboard. TAP THE ALT/OPTION KEY to
 * accept the next fix (a tap, not a chord — Alt+anything is left alone), or
 * click a fix to apply just that one. A floating accent pad on the right
 * covers hand-typing accents.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, PenLine, Plus, Trash2, Check, X, CornerDownLeft, Sparkles } from "lucide-react";

const ACCENTS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "œ", "ù", "û", "ü", "É", "À", "Ç", "«", "»", "’"];

const KIND_STYLE: Record<string, string> = {
  accent: "bg-sky-500/15 text-sky-800",
  grammar: "bg-amber-500/15 text-amber-800",
  spelling: "bg-rose-500/15 text-rose-800",
};

interface Fix { before: string; after: string; kind: "accent" | "grammar" | "spelling"; note: string }

function todayTitle(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  const days = (Date.now() - ts) / 86400000;
  if (days < 1 && d.getDate() === new Date().getDate()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WritingTab() {
  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.writing.list.useQuery();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState(todayTitle());
  const [body, setBody] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [checking, setChecking] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Refs mirroring state, for the once-bound key handler and debounce timers.
  const stateRef = useRef({ activeId, title, body });
  stateRef.current = { activeId, title, body };
  const lastCheckedRef = useRef("");

  const saveMutation = trpc.writing.save.useMutation();
  const removeMutation = trpc.writing.remove.useMutation();
  const checkMutation = trpc.writing.check.useMutation({ trpc: { context: { skipBatch: true } } });
  // Mutation objects change identity every render — flush must NOT depend on
  // them, or every effect built on it re-fires per render (v1 of this file
  // inserted a blank entry per render that way).
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;
  const utilsRef = useRef(utils);
  utilsRef.current = utils;
  const checkMutationRef = useRef(checkMutation);
  checkMutationRef.current = checkMutation;

  // ── Autosave (debounced) ────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);
  const flush = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const s = stateRef.current;
    if (!s.body.trim()) return; // an empty page isn't worth a row — title is just the date
    // Never run two saves at once: with no id yet, parallel saves each INSERT.
    if (saveInFlight.current) { saveTimer.current = setTimeout(() => void flush(), 600); return; }
    saveInFlight.current = true;
    setSaveState("saving");
    try {
      const { id } = await saveMutationRef.current.mutateAsync({ id: s.activeId ?? undefined, title: s.title, body: s.body });
      if (s.activeId === null) setActiveId(id);
      setSaveState("saved");
      utilsRef.current.writing.list.invalidate();
    } catch {
      setSaveState("dirty");
      toast.error("Couldn't save — will retry on next edit");
    } finally {
      saveInFlight.current = false;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1200);
  }, [flush]);

  // ── Live proofreading (debounced on pauses) ────────────────────────────────
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCheck = useCallback(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      const text = stateRef.current.body.trim();
      if (text.length < 10 || text === lastCheckedRef.current) return;
      lastCheckedRef.current = text;
      setChecking(true);
      try {
        const res = await checkMutationRef.current.mutateAsync({ text });
        // Only keep fixes that still apply to what's in the editor now.
        setFixes((res.fixes as Fix[]).filter((f: Fix) => stateRef.current.body.includes(f.before)));
      } catch { /* quiet — live checking must never nag */ }
      setChecking(false);
    }, 2500);
  }, []);

  const onBodyChange = (next: string) => {
    setBody(next);
    scheduleSave();
    scheduleCheck();
    setFixes((fs) => fs.filter((f) => next.includes(f.before)));
  };

  // ── Applying fixes ──────────────────────────────────────────────────────────
  const applyFix = useCallback((fix: Fix) => {
    const s = stateRef.current;
    const at = s.body.indexOf(fix.before);
    if (at === -1) { setFixes((fs) => fs.filter((f) => f !== fix)); return; }
    const next = s.body.slice(0, at) + fix.after + s.body.slice(at + fix.before.length);
    setBody(next);
    setFixes((fs) => fs.filter((f) => f !== fix).filter((f) => next.includes(f.before)));
    scheduleSave();
    // The applied text is "checked" — don't immediately re-check because of it.
    lastCheckedRef.current = next.trim();
  }, [scheduleSave]);

  const fixesRef = useRef<Fix[]>([]);
  fixesRef.current = fixes;
  const applyFixRef = useRef(applyFix);
  applyFixRef.current = applyFix;

  // Alt/Option TAP accepts the next fix. A tap, not a chord: any other key
  // pressed while Alt is down (⌥S, accent typing on macOS) cancels it.
  useEffect(() => {
    let altDown = false;
    let chorded = false;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") { altDown = true; chorded = e.repeat; return; }
      if (altDown) chorded = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      const wasClean = altDown && !chorded;
      altDown = false;
      if (wasClean && fixesRef.current.length > 0) {
        e.preventDefault();
        applyFixRef.current(fixesRef.current[0]);
      }
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, []);

  // ── Entry switching ─────────────────────────────────────────────────────────
  const openEntry = async (id: number | null) => {
    await flush();
    setConfirmDelete(false);
    setFixes([]);
    lastCheckedRef.current = "";
    if (id === null) {
      setActiveId(null);
      setTitle(todayTitle());
      setBody("");
      setSaveState("saved");
      requestAnimationFrame(() => areaRef.current?.focus());
      return;
    }
    const e = (utils.writing.list.getData() ?? entries).find((x) => x.id === id);
    if (!e) return;
    setActiveId(e.id);
    setTitle(e.title);
    setBody(e.body);
    setSaveState("saved");
    lastCheckedRef.current = e.body.trim();
  };

  // First load: open the most recent entry, or start today's page.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current || isLoading) return;
    bootstrapped.current = true;
    if (entries.length > 0) {
      setActiveId(entries[0].id);
      setTitle(entries[0].title);
      setBody(entries[0].body);
      lastCheckedRef.current = entries[0].body.trim();
    }
  }, [isLoading, entries]);

  // Flush pending edits when the tab unmounts — and ONLY then (flush is
  // dependency-stable, so this effect mounts exactly once).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { void flush(); }, []);

  const deleteEntry = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setConfirmDelete(false);
    if (activeId !== null) {
      try { await removeMutation.mutateAsync({ id: activeId }); } catch { toast.error("Delete failed"); return; }
      utils.writing.list.invalidate();
    }
    const rest = entries.filter((e) => e.id !== activeId);
    if (rest.length > 0) void openEntry(rest[0].id);
    else void openEntry(null);
  };

  /** Insert a character at the caret, keeping focus in the textarea. */
  const insert = (ch: string) => {
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    if (!document.execCommand("insertText", false, ch)) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      onBodyChange(body.slice(0, start) + ch + body.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + ch.length, start + ch.length); });
    } else {
      scheduleSave();
      scheduleCheck();
    }
  };

  const next = fixes[0];
  const accentCount = useMemo(() => fixes.filter((f) => f.kind === "accent").length, [fixes]);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* ── Entries rail ─────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 border-r border-border bg-muted/20 flex flex-col min-h-0">
        <div className="flex-shrink-0 h-14 px-4 flex items-center justify-between border-b border-border">
          <p className="font-display text-sm font-bold text-foreground flex items-center gap-2">
            <PenLine className="w-4 h-4 text-primary" /> Journal
          </p>
          <button
            onClick={() => void openEntry(null)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 && activeId === null && !body ? (
            <p className="px-3 py-6 text-xs text-muted-foreground leading-relaxed">
              Your first page is open — start writing and it saves itself.
            </p>
          ) : (
            entries.map((e) => (
              <button
                key={e.id}
                onClick={() => void openEntry(e.id)}
                className={cn(
                  "w-full text-left rounded-xl px-3 py-2.5 border-l-[3px] transition-colors",
                  e.id === activeId
                    ? "bg-card border-primary shadow-sm"
                    : "border-transparent hover:bg-card/60"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-foreground truncate">{e.title || "Untitled"}</p>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground tabular-nums">{fmtWhen(e.updatedAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5">
                  {e.body.replace(/\s+/g, " ").trim() || "Empty"}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {/* Status bar */}
        <div className="flex-shrink-0 h-14 px-6 flex items-center justify-end gap-3 border-b border-border bg-background/80">
          {checking && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary" /> checking…
            </span>
          )}
          <span className={cn("text-xs font-semibold", saveState === "saved" ? "text-emerald-700" : "text-muted-foreground")}>
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Editing…"}
          </span>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={() => void deleteEntry()} className="px-2.5 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold">Delete entry</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold">✕</button>
            </div>
          ) : (
            <button
              onClick={() => void deleteEntry()}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete this entry"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Page */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 sm:px-14 py-10 lg:pr-24">
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={todayTitle()}
              className="w-full bg-transparent border-none outline-none font-display text-3xl sm:text-4xl font-bold text-foreground placeholder-muted-foreground/50 mb-6"
            />
            <textarea
              ref={areaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Écris librement — les accents peuvent manquer, le correcteur veille…"
              className="w-full min-h-[60vh] resize-none bg-transparent border-none outline-none text-[17px] leading-8 text-foreground placeholder-muted-foreground/60"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
            />
            <div className="h-40" />
          </div>
        </div>

        {/* Live suggestion bar — docked at the editor's foot */}
        {next && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(44rem,calc(100%-3rem))]">
            <div className="rounded-2xl bg-card border border-border shadow-[0_16px_40px_-12px_rgb(23_63_107_/_0.4)] p-3.5">
              <div className="flex items-center gap-3">
                <span className={cn("flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", KIND_STYLE[next.kind] ?? KIND_STYLE.grammar)}>
                  {next.kind}
                </span>
                <p className="text-sm min-w-0 truncate">
                  <span className="text-rose-700 line-through decoration-rose-400/70">{next.before}</span>
                  <span className="text-muted-foreground mx-1.5">→</span>
                  <span className="font-semibold text-emerald-800">{next.after}</span>
                </p>
                <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => applyFix(next)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                    <kbd className="font-mono text-[10px] border border-primary-foreground/40 rounded px-1 leading-tight">⌥</kbd>
                  </button>
                  <button
                    onClick={() => setFixes((fs) => fs.filter((f) => f !== next))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {next.note && <p className="text-xs text-muted-foreground mt-1.5 ml-1">{next.note}</p>}
              {fixes.length > 1 && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
                  <p className="text-[11px] text-muted-foreground">
                    {fixes.length - 1} more · tap <kbd className="font-mono border border-current rounded px-1">⌥ alt</kbd> to accept one at a time
                  </p>
                  <button
                    onClick={() => { let b = stateRef.current.body; for (const f of fixesRef.current) { const at = b.indexOf(f.before); if (at !== -1) b = b.slice(0, at) + f.after + b.slice(at + f.before.length); } setBody(b); setFixes([]); lastCheckedRef.current = b.trim(); scheduleSave(); }}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                  >
                    <CornerDownLeft className="w-3 h-3" /> Accept all{accentCount > 0 ? ` (${accentCount} accents)` : ""}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating accent pad */}
        <div className="hidden md:flex flex-col gap-1 absolute right-3 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-2xl bg-card/90 backdrop-blur border border-border shadow-sm max-h-[72vh] overflow-y-auto scrollbar-none">
          {ACCENTS.map((ch) => (
            <button
              key={ch}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(ch)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/15 hover:text-primary text-foreground/80 text-[15px] font-medium transition-colors"
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
