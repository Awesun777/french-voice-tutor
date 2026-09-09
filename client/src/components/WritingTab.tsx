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
import { Loader2, PenLine, Plus, Trash2, Bold, Italic, Underline, List, Sparkles, CornerDownLeft, SpellCheck, Palette, BookmarkPlus, Check, Search, X } from "lucide-react";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState(todayTitle());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [checking, setChecking] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  // ── Handwriting font ────────────────────────────────────────────────────────
  // Indie Flower (Google Fonts) is the journal's default voice; the toggle
  // switches to the standard face. Handwriting faces run small, so it gets a
  // size bump when active. Persisted.
  const [handwriting, setHandwriting] = useState<boolean>(() => {
    try { return localStorage.getItem("rt-writing-font") !== "default"; } catch { return true; }
  });
  const toggleHandwriting = () => {
    setHandwriting((h) => {
      try { localStorage.setItem("rt-writing-font", h ? "default" : "indie"); } catch { /* private mode */ }
      return !h;
    });
  };


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
  const lookupMutation = trpc.dictionary.search.useMutation({ trpc: { context: { skipBatch: true } } });
  const addVocabMutation = trpc.vocab.add.useMutation();
  const lookupMutationRef = useRef(lookupMutation); lookupMutationRef.current = lookupMutation;
  const addVocabMutationRef = useRef(addVocabMutation); addVocabMutationRef.current = addVocabMutation;
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
  // Fix chips anchor to text positions — a font swap reflows everything, so
  // recompute once the new face has applied (double-rAF spans the reflow).
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(reposition));
    return () => cancelAnimationFrame(raf);
  }, [handwriting, reposition]);
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
  /**
   * The paragraph (contiguous non-empty block lines) the caret sits in, or
   * null when it can't be determined. Live checks are scoped to this: faster
   * (less text to the model) and it guarantees a pasted homework prompt at
   * the top of the page is never re-litigated while answers are written
   * below it — the "Check all" button covers the whole passage on demand.
   */
  const caretParagraph = (): string | null => {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.getRangeAt(0).startContainer;
    if (!root.contains(node)) return null;
    while (node && node !== root && node.parentNode !== root) node = node.parentNode;
    if (!node || node === root) return null; // flat editor — fall back to full text
    const nonEmpty = (el: Node | null) => !!el && !!(el.textContent ?? "").trim();
    let a: Node = node, b: Node = node;
    while (a.previousSibling && nonEmpty(a.previousSibling)) a = a.previousSibling;
    while (b.nextSibling && nonEmpty(b.nextSibling)) b = b.nextSibling;
    const parts: string[] = [];
    for (let cur: Node | null = a; cur; cur = cur.nextSibling) {
      parts.push(cur.textContent ?? "");
      if (cur === b) break;
    }
    const text = parts.join("\n").trim();
    return text || null;
  };

  const runCheck = useCallback(async (scope: "paragraph" | "all") => {
    const text = (scope === "paragraph" ? (caretParagraph() ?? editorText()) : editorText()).trim();
    if (text.length < 10 || (scope === "paragraph" && text === lastCheckedRef.current)) return;
    lastCheckedRef.current = text;
    setChecking(true);
    try {
      const res = await checkMutationRef.current.mutateAsync({ text });
      const current = editorText();
      setFixes((prev) => {
        const fresh = (res.fixes as Fix[]).filter((f: Fix) => current.includes(f.before));
        if (scope === "all") return fresh; // full pass replaces everything
        // Paragraph pass: keep fixes from other paragraphs, replace this one's.
        const kept = prev.filter((f) => current.includes(f.before) && !text.includes(f.before));
        return [...kept, ...fresh.filter((f) => !kept.some((k) => k.before === f.before))];
      });
    } catch {
      if (scope === "all") toast.error("Check failed — try again");
    }
    setChecking(false);
  }, []);
  const runCheckRef = useRef(runCheck); runCheckRef.current = runCheck;

  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCheck = useCallback(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => void runCheckRef.current("paragraph"), 1600);
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

  // ── Selection → save to vocab ───────────────────────────────────────────────
  // Selecting words in the draft floats a "+ Save to vocab" chip above the
  // selection; clicking looks up the translation and files it in the library.
  const [selSave, setSelSave] = useState<{ text: string; left: number; top: number; state: "idle" | "busy" | "done" } | null>(null);
  const selTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onSelChange = () => {
      if (selTimer.current) clearTimeout(selTimer.current);
      selTimer.current = setTimeout(() => {
        const root = editorRef.current;
        const page = pageRef.current;
        const sel = window.getSelection();
        if (!root || !page || !sel || sel.rangeCount === 0 || sel.isCollapsed) { setSelSave(null); return; }
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) { setSelSave(null); return; }
        const text = sel.toString().replace(/\s+/g, " ").trim();
        if (text.length < 2 || text.length > 120) { setSelSave(null); return; }
        const r = range.getBoundingClientRect();
        const pageBox = page.getBoundingClientRect();
        setSelSave((prev) => ({
          text,
          left: r.left - pageBox.left,
          top: r.top - pageBox.top,
          state: prev?.text === text ? prev.state : "idle",
        }));
      }, 180);
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => {
      document.removeEventListener("selectionchange", onSelChange);
      if (selTimer.current) clearTimeout(selTimer.current);
    };
  }, []);

  const saveSelection = async () => {
    if (!selSave || selSave.state !== "idle") return;
    const term = selSave.text;
    setSelSave({ ...selSave, state: "busy" });
    try {
      // A quick meaning lookup supplies the translation (cached server-side).
      const res = (await lookupMutationRef.current.mutateAsync({ term, parts: "meaning" })) as {
        type?: string; found?: boolean; word?: string; phrase?: string; translation?: string;
      };
      const translation = res?.translation?.trim();
      if (!translation) { toast.error(`Couldn't translate «${term}»`); setSelSave(null); return; }
      await addVocabMutationRef.current.mutateAsync({
        term,
        translation,
        // Same ≥3-words rule the rest of the app uses.
        entryKind: term.split(/\s+/).length >= 3 ? "phrase" : "word",
        lessonSource: "Writing",
      });
      utilsRef.current.vocab.list.invalidate();
      toast.success(`Saved «${term}» — ${translation}`);
      setSelSave((prev) => (prev && prev.text === term ? { ...prev, state: "done" } : prev));
      setTimeout(() => setSelSave((prev) => (prev?.text === term ? null : prev)), 1500);
    } catch {
      toast.error("Couldn't save — try again");
      setSelSave((prev) => (prev && prev.text === term ? { ...prev, state: "idle" } : prev));
    }
  };

  // ── Formatting ──────────────────────────────────────────────────────────────
  const [colorOpen, setColorOpen] = useState(false);
  const format = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd);
    onEdited();
  };
  const applyColor = (c: string) => {
    const root = editorRef.current;
    if (!root) return;
    root.focus();
    // "" = back to the theme's default text colour.
    document.execCommand("foreColor", false, c || getComputedStyle(root).color);
    setColorOpen(false);
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
      {/* ── Entries rail — floating title cards on the right, no dividers.
             Entries arrive from the server newest-edited first. ───────────── */}
      <aside className="order-last w-72 flex-shrink-0 flex flex-col min-h-0">
        <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-2">
          <p className="font-display text-sm font-bold text-foreground flex items-center gap-2">
            <PenLine className="w-4 h-4 text-primary" /> Journal
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setSearchOpen((v) => { if (v) setSearch(""); return !v; }); }}
              aria-label={searchOpen ? "Close search" : "Search journals"}
              aria-expanded={searchOpen}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                searchOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => void openEntry(null)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="flex-shrink-0 mx-4 mb-2 flex items-center gap-2 rounded-xl bg-card px-3 py-2 shadow-[0_8px_22px_-10px_rgb(23_63_107_/_0.35)] ring-1 ring-black/5">
            <Search className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
              placeholder="Search journals…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-2.5">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 && activeId === null && isEmpty ? (
            <p className="px-1 py-6 text-xs text-muted-foreground leading-relaxed">
              Your first page is open — start writing and it saves itself.
            </p>
          ) : (
            (() => {
              const q = search.trim().toLowerCase();
              const shown = q
                ? entries.filter((e) =>
                    (e.title || "Untitled").toLowerCase().includes(q) ||
                    stripHtml(e.body).toLowerCase().includes(q))
                : entries;
              if (shown.length === 0) {
                return <p className="px-1 py-6 text-xs text-muted-foreground">No journals match “{search.trim()}”.</p>;
              }
              return shown.map((e) => (
                <button
                  key={e.id}
                  onClick={() => void openEntry(e.id)}
                  title={fmtWhen(e.updatedAt)}
                  className={cn(
                    "w-full text-left rounded-2xl bg-card px-3.5 py-3 ring-1 transition-shadow",
                    e.id === activeId
                      ? "ring-primary/50 shadow-[0_14px_32px_-12px_rgb(23_63_107_/_0.5)]"
                      : "ring-black/5 shadow-[0_10px_26px_-12px_rgb(23_63_107_/_0.35)] hover:shadow-[0_14px_32px_-12px_rgb(23_63_107_/_0.45)]"
                  )}
                >
                  <p className="text-sm font-bold text-foreground truncate">{e.title || "Untitled"}</p>
                </button>
              ));
            })()
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
          {/* Text colour */}
          <div className="relative">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColorOpen((o) => !o)}
              title="Text colour"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Palette className="w-4 h-4" />
            </button>
            {colorOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setColorOpen(false)} />
                <div className="absolute left-0 top-[calc(100%+4px)] z-30 flex gap-1.5 p-2 rounded-xl bg-popover shadow-lg ring-1 ring-black/5">
                  {["", "#B3372E", "#1D7A4F", "#2F5FA8", "#B45309", "#7C3AED"].map((c) => (
                    <button
                      key={c || "default"}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyColor(c)}
                      title={c ? c : "Default"}
                      className="w-6 h-6 rounded-full border border-border hover:scale-110 transition-transform"
                      style={{ background: c || "var(--foreground, #1f2b3d)" }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Handwriting font toggle — Indie Flower for the journal voice. */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleHandwriting}
            title={handwriting ? "Back to the standard font" : "Handwriting font (Indie Flower)"}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[15px] leading-none transition-colors",
              handwriting ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            style={{ fontFamily: "'Indie Flower', cursive" }}
          >
            Aa
          </button>
          {/* Full-passage check — live checks only cover the paragraph being
              edited, so this is the "proof the whole page" button. */}
          <button
            onClick={() => void runCheck("all")}
            disabled={checking}
            className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors disabled:opacity-50"
          >
            <SpellCheck className="w-3.5 h-3.5" /> Check all
          </button>
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
              placeholder={todayTitle()}
              className="w-full bg-transparent border-none outline-none font-display text-3xl sm:text-4xl font-bold text-foreground placeholder-muted-foreground/50 mb-6"
              style={handwriting ? { fontFamily: "'Indie Flower', cursive" } : undefined}
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
                className={cn(
                  "min-h-[60vh] outline-none text-foreground [&_b]:font-bold [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-6",
                  // Handwriting faces run small — Indie Flower gets a bump.
                  handwriting ? "text-[22px] leading-9" : "text-[17px] leading-8"
                )}
                style={handwriting ? { fontFamily: "'Indie Flower', cursive" } : undefined}
              />
            </div>
            <div className="h-40" />

            {/* Selection chip: floats above selected words — one click files
                them (with a looked-up translation) into the vocab library. */}
            {selSave && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveSelection()}
                className={cn(
                  "absolute z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold shadow-[0_10px_28px_-8px_rgb(23_63_107_/_0.5)] transition-colors whitespace-nowrap",
                  selSave.state === "done"
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
                style={{ left: selSave.left, top: selSave.top - 36 }}
              >
                {selSave.state === "busy" ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                ) : selSave.state === "done" ? (
                  <><Check className="w-3.5 h-3.5" /> Saved</>
                ) : (
                  <><BookmarkPlus className="w-3.5 h-3.5" /> Save to vocab</>
                )}
              </button>
            )}

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

        {/* Floating accent bar — bottom centre; same elevation treatment as
            the pop-up dictionary palette so it reads as a floating layer. */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex flex-row flex-wrap justify-center gap-1.5 p-2.5 rounded-3xl bg-popover ring-1 ring-black/5 shadow-[0_24px_60px_-12px_rgb(23_63_107_/_0.45)] max-w-[min(52rem,94%)]">
          {ACCENTS.map((ch) => (
            <button
              key={ch}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(ch)}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-muted/50 hover:bg-primary/15 hover:text-primary text-foreground text-lg font-medium transition-colors"
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
