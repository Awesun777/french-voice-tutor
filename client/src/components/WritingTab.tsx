/**
 * WritingTab (admin) — a journal-style French writing pad.
 *
 * v3: the editor is contentEditable, so basic formatting works (bold /
 * italic / underline / lists via the toolbar or ⌘B/⌘I/⌘U), and grammar
 * suggestions anchor INLINE: each pending fix gets a soft underline in the
 * text and a chip floating just above the word — click the chip to accept
 * that fix in place. Tapping Alt/Option still accepts the first fix.
 *
 * The editable is uncontrolled (React never re-renders its innerHTML —
 * that would eat the caret); state lives in refs, and overlays are
 * positioned from DOM Ranges found by walking text nodes, so they ride
 * along with the content as it reflows.
 *
 * Checking runs on Gemini Flash (thinking off) for ~1-2s turnaround.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, PenLine, Plus, Trash2, Bold, Italic, Underline, List, Sparkles, CornerDownLeft } from "lucide-react";

const ACCENTS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "œ", "ù", "û", "ü", "É", "À", "Ç", "«", "»", "’"];

const KIND_COLOR: Record<string, string> = {
  accent: "bg-sky-600",
  grammar: "bg-amber-600",
  spelling: "bg-rose-600",
};

interface Fix { before: string; after: string; kind: "accent" | "grammar" | "spelling"; note: string }
interface Mark { fix: Fix; left: number; top: number; width: number; height: number }

function todayTitle(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  if (Date.now() - ts < 86400000 && d.getDate() === new Date().getDate()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Stored bodies may be plain text from v2 — turn those into innerHTML safely. */
function toEditorHtml(body: string): string {
  if (body.includes("<")) return body; // already HTML (self-authored)
  return body
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/**
 * Find `needle` in the editable's text and return a DOM Range, walking text
 * nodes so a match spanning formatting boundaries (…<b>…</b>…) still works.
 */
function findRange(root: HTMLElement, needle: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = "";
  let n: Node | null;
  while ((n = walker.nextNode())) {
    starts.push(full.length);
    nodes.push(n as Text);
    full += (n as Text).data;
  }
  const at = full.indexOf(needle);
  if (at === -1) return null;
  const locate = (pos: number) => {
    for (let i = 0; i < nodes.length; i++) {
      const s = starts[i];
      const e = s + nodes[i].data.length;
      if (pos >= s && pos <= e) return { node: nodes[i], offset: pos - s };
    }
    return null;
  };
  const a = locate(at);
  const b = locate(at + needle.length);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

export default function WritingTab() {
  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.writing.list.useQuery();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [title, setTitle] = useState(todayTitle());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [checking, setChecking] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const editorRef = useRef<HTMLDivElement | null>(null);
  /** The positioning parent for overlays — the padded page column. */
  const pageRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({ activeId, title });
  stateRef.current = { activeId, title };
  const lastCheckedRef = useRef("");
  const fixesRef = useRef<Fix[]>([]);
  fixesRef.current = fixes;

  const saveMutation = trpc.writing.save.useMutation();
  const removeMutation = trpc.writing.remove.useMutation();
  const checkMutation = trpc.writing.check.useMutation({ trpc: { context: { skipBatch: true } } });
  const saveMutationRef = useRef(saveMutation); saveMutationRef.current = saveMutation;
  const checkMutationRef = useRef(checkMutation); checkMutationRef.current = checkMutation;
  const utilsRef = useRef(utils); utilsRef.current = utils;

  const editorText = () => editorRef.current?.innerText ?? "";
  const editorHtml = () => editorRef.current?.innerHTML ?? "";

  // ── Overlay positioning ─────────────────────────────────────────────────────
  const reposition = useCallback(() => {
    const root = editorRef.current;
    const page = pageRef.current;
    if (!root || !page) { setMarks([]); return; }
    const pageBox = page.getBoundingClientRect();
    const next: Mark[] = [];
    for (const fix of fixesRef.current) {
      const range = findRange(root, fix.before);
      if (!range) continue;
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      next.push({ fix, left: r.left - pageBox.left, top: r.top - pageBox.top, width: r.width, height: r.height });
    }
    setMarks(next);
  }, []);

  useEffect(() => { reposition(); }, [fixes, reposition]);
  useEffect(() => {
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reposition]);

  // ── Autosave (debounced; dependency-stable) ────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);
  const flush = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const s = stateRef.current;
    const html = editorHtml();
    if (!stripHtml(html)) return; // an empty page isn't worth a row
    if (saveInFlight.current) { saveTimer.current = setTimeout(() => void flush(), 600); return; }
    saveInFlight.current = true;
    setSaveState("saving");
    try {
      const { id } = await saveMutationRef.current.mutateAsync({ id: s.activeId ?? undefined, title: s.title, body: html });
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

  // ── Live proofreading ───────────────────────────────────────────────────────
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCheck = useCallback(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      const text = editorText().trim();
      if (text.length < 10 || text === lastCheckedRef.current) return;
      lastCheckedRef.current = text;
      setChecking(true);
      try {
        const res = await checkMutationRef.current.mutateAsync({ text });
        const current = editorText();
        setFixes((res.fixes as Fix[]).filter((f: Fix) => current.includes(f.before)));
      } catch { /* quiet — live checking must never nag */ }
      setChecking(false);
    }, 1600);
  }, []);

  const onEdited = useCallback(() => {
    setIsEmpty(!editorText().trim());
    scheduleSave();
    scheduleCheck();
    const current = editorText();
    setFixes((fs) => fs.filter((f) => current.includes(f.before)));
    requestAnimationFrame(reposition);
  }, [scheduleSave, scheduleCheck, reposition]);

  // ── Applying fixes ──────────────────────────────────────────────────────────
  const applyFix = useCallback((fix: Fix) => {
    const root = editorRef.current;
    if (!root) return;
    const range = findRange(root, fix.before);
    if (!range) { setFixes((fs) => fs.filter((f) => f !== fix)); return; }
    range.deleteContents();
    range.insertNode(document.createTextNode(fix.after));
    root.normalize();
    setFixes((fs) => fs.filter((f) => f !== fix));
    lastCheckedRef.current = editorText().trim(); // applied text counts as checked
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1200);
    requestAnimationFrame(reposition);
  }, [flush, reposition]);
  const applyFixRef = useRef(applyFix); applyFixRef.current = applyFix;

  const acceptAll = useCallback(() => {
    for (const f of [...fixesRef.current]) applyFixRef.current(f);
  }, []);

  // Alt/Option TAP accepts the first fix — a tap, not a chord.
  useEffect(() => {
    let altDown = false;
    let chorded = false;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") { altDown = true; chorded = e.repeat; return; }
      if (altDown) chorded = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      const clean = altDown && !chorded;
      altDown = false;
      if (clean && fixesRef.current.length > 0) {
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

  // ── Formatting ──────────────────────────────────────────────────────────────
  const format = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd);
    onEdited();
  };

  // ── Entry switching ─────────────────────────────────────────────────────────
  const loadIntoEditor = (html: string) => {
    if (editorRef.current) editorRef.current.innerHTML = toEditorHtml(html);
    setIsEmpty(!stripHtml(html));
  };

  const openEntry = async (id: number | null) => {
    await flush();
    setConfirmDelete(false);
    setFixes([]);
    lastCheckedRef.current = "";
    if (id === null) {
      setActiveId(null);
      setTitle(todayTitle());
      loadIntoEditor("");
      setSaveState("saved");
      requestAnimationFrame(() => editorRef.current?.focus());
      return;
    }
    const e = (utils.writing.list.getData() ?? entries).find((x) => x.id === id);
    if (!e) return;
    setActiveId(e.id);
    setTitle(e.title);
    loadIntoEditor(e.body);
    setSaveState("saved");
    lastCheckedRef.current = editorText().trim();
  };

  // First load: open the most recent entry.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current || isLoading) return;
    bootstrapped.current = true;
    if (entries.length > 0) {
      setActiveId(entries[0].id);
      setTitle(entries[0].title);
      loadIntoEditor(entries[0].body);
      lastCheckedRef.current = editorText().trim();
    }
  }, [isLoading, entries]);

  // Flush pending edits on unmount only (flush is dependency-stable).
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

  const insert = (ch: string) => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, ch);
    onEdited();
  };

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
          ) : entries.length === 0 && activeId === null && isEmpty ? (
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
                  e.id === activeId ? "bg-card border-primary shadow-sm" : "border-transparent hover:bg-card/60"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-foreground truncate">{e.title || "Untitled"}</p>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground tabular-nums">{fmtWhen(e.updatedAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2 mt-0.5">
                  {stripHtml(e.body) || "Empty"}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {/* Toolbar + status */}
        <div className="flex-shrink-0 h-14 px-6 flex items-center gap-1 border-b border-border bg-background/80">
          {[
            { cmd: "bold", icon: <Bold className="w-4 h-4" />, hint: "Bold (⌘B)" },
            { cmd: "italic", icon: <Italic className="w-4 h-4" />, hint: "Italic (⌘I)" },
            { cmd: "underline", icon: <Underline className="w-4 h-4" />, hint: "Underline (⌘U)" },
            { cmd: "insertUnorderedList", icon: <List className="w-4 h-4" />, hint: "Bullet list" },
          ].map((b) => (
            <button
              key={b.cmd}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => format(b.cmd)}
              title={b.hint}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {b.icon}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            {checking && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-primary" /> checking…
              </span>
            )}
            {fixes.length > 1 && (
              <button onClick={acceptAll} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                <CornerDownLeft className="w-3 h-3" /> Accept all {fixes.length}
              </button>
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
              <button onClick={() => void deleteEntry()} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete this entry">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Page */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div ref={pageRef} className="relative max-w-4xl mx-auto px-8 sm:px-14 py-10 lg:pr-24">
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={todayTitle()}
              className="w-full bg-transparent border-none outline-none font-display text-3xl sm:text-4xl font-bold text-foreground placeholder-muted-foreground/50 mb-6"
            />
            <div className="relative">
              {isEmpty && (
                <p className="absolute top-0 left-0 pointer-events-none text-[17px] leading-8 text-muted-foreground/60">
                  Écris librement — les accents peuvent manquer, le correcteur veille…
                </p>
              )}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={onEdited}
                onKeyDown={(e) => e.stopPropagation()}
                className="min-h-[60vh] outline-none text-[17px] leading-8 text-foreground [&_b]:font-bold [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-6"
              />
            </div>
            <div className="h-40" />

            {/* Inline fix overlays: a soft underline under the word, and a
                chip floating right above it — click to accept in place. */}
            {marks.map((m, i) => (
              <div key={`${m.fix.before}-${i}`}>
                <div
                  className={cn("absolute pointer-events-none rounded-full opacity-70", KIND_COLOR[m.fix.kind] ?? KIND_COLOR.grammar)}
                  style={{ left: m.left, top: m.top + m.height - 2, width: Math.max(m.width, 8), height: 2 }}
                />
                <button
                  onClick={() => applyFix(m.fix)}
                  onMouseDown={(e) => e.preventDefault()}
                  title={`${m.fix.note || m.fix.kind}${i === 0 ? " — or tap ⌥" : ""}`}
                  className={cn(
                    "absolute z-20 flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold text-white shadow-md hover:scale-105 transition-transform whitespace-nowrap",
                    KIND_COLOR[m.fix.kind] ?? KIND_COLOR.grammar
                  )}
                  style={{ left: m.left, top: m.top - 26 }}
                >
                  {m.fix.after}
                  {i === 0 && <kbd className="font-mono text-[9px] border border-white/50 rounded px-0.5 leading-tight">⌥</kbd>}
                </button>
              </div>
            ))}
          </div>
        </div>

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
