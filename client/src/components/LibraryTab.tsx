import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VocabEntry, SidebarTab, ImportItem } from "@/types";
import { Star, Trash2, Search, Download, Upload, Loader2, ChevronDown, ChevronRight, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { VocabHeatmap } from "@/components/VocabHeatmap";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ImportModal from "./ImportModal";
import { GoogleDrivePanel } from "./GoogleDrivePanel";
import VocabularySummary from "./VocabularySummary";
import LibraryPaletteWord from "./LibraryPaletteWord";

import { vocabularyStage, type VocabularyStage } from "@/lib/vocabularySummary";

function todayKey() { return new Date().toISOString().split("T")[0]; }
function yesterdayKey() { return new Date(Date.now() - 86400000).toISOString().split("T")[0]; }

/**
 * Try to parse a user-typed string into a YYYY-MM-DD key.
 * Handles: "Yesterday", "Today", "Oct 2, 2025", "2025-10-02", "March 15", etc.
 * Returns null if the string cannot be interpreted as a date.
 */
function parseToDateKey(input: string): string | null {
  const trimmed = input.trim();
  // Already a valid YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Special keywords
  if (/^today$/i.test(trimmed)) return todayKey();
  if (/^yesterday$/i.test(trimmed)) return yesterdayKey();
  // Try native Date.parse — handles "Oct 2, 2025", "March 15 2026", "2025/10/02", etc.
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) {
    // If no year was given (e.g. "March 15"), Date.parse uses current year — that's fine
    return new Date(ts).toISOString().split("T")[0];
  }
  return null;
}

/** Format a dateKey (YYYY-MM-DD) or a custom label string for display */
function fmtDateLabel(dateKey: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    if (dateKey === todayKey()) return "Today";
    if (dateKey === yesterdayKey()) return "Yesterday";
    return new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  return dateKey;
}

/**
 * Returns a numeric sort value for a dateKey.
 * YYYY-MM-DD keys → their timestamp (ms). Custom labels → -1 (sort last).
 */
function dateKeyToSortValue(key: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return new Date(key + "T12:00:00").getTime();
  }
  return -1; // custom labels always sort to the bottom
}

function isDue(w: VocabEntry) {
  if (w.starred) return true;
  const seen = w.quizCount ?? 0;
  if (seen === 0) return true;
  const last = w.lastQuizzed ? new Date(w.lastQuizzed) : new Date(0);
  const days = (Date.now() - last.getTime()) / 86400000;
  return seen === 1 ? days >= 1 : days >= 3;
}

function exportCSV(words: VocabEntry[]) {
  const header = "French,English,Type,Date\n";
  const rows = words
    .map((w) => `"${w.term.replace(/"/g, '""')}","${w.translation.replace(/"/g, '""')}","${w.entryKind}","${w.dateKey}"`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "french_vocabulary.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── Group header with collapse + rename ──────────────────────────────────────
function GroupHeader({
  dateKey,
  wordCount,
  dueCount,
  isOpen,
  onToggle,
  onRename,
  onDeleteGroup,
  paletteMode = false,
}: {
  paletteMode?: boolean;
  dateKey: string;
  wordCount: number;
  dueCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onRename: (oldKey: string, newKey: string) => void;
  onDeleteGroup: (dateKey: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(fmtDateLabel(dateKey));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(fmtDateLabel(dateKey));
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [editing, dateKey]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === fmtDateLabel(dateKey)) { setEditing(false); return; }
    const normalised = parseToDateKey(trimmed) ?? trimmed;
    onRename(dateKey, normalised);
    setEditing(false);
  };

  const cancel = () => { setEditing(false); setDraft(fmtDateLabel(dateKey)); };

  return (
    <div
      className={cn("flex items-center gap-2 group/header", paletteMode ? "px-5 sm:px-7 py-5 flex-wrap" : "px-4 py-3 border-b border-primary/20 bg-primary/10")}
      onClick={(e) => { if (!editing) { e.stopPropagation(); onToggle(); } }}
    >
      {/* Collapse toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-label={isOpen ? "Fold date" : "Unfold date"}
        aria-expanded={isOpen}
        className={cn("transition-colors flex-shrink-0", !paletteMode && "text-primary/60 hover:text-primary")}
      >
        {isOpen
          ? <ChevronDown className="w-3.5 h-3.5" />
          : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Label / edit input */}
      {editing ? (
        <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
            className="flex-1 min-w-0 font-display text-xs font-bold uppercase tracking-wider bg-card border border-primary/50 rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Group name or YYYY-MM-DD"
          />
          <button onClick={commit} className="p-1 rounded-md text-emerald-700 hover:bg-emerald-500/10 transition-colors flex-shrink-0">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={cancel} className="p-1 rounded-md text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <p className={cn("flex-1 min-w-0 uppercase cursor-pointer select-none", paletteMode ? "font-sans font-black text-2xl sm:text-4xl leading-none tracking-tighter break-words" : "font-display font-bold text-xs text-primary tracking-wider")}>
            {fmtDateLabel(dateKey)}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className={cn("p-1 rounded-md transition-colors flex-shrink-0", paletteMode ? "hover:bg-current/10" : "text-primary/60 hover:text-primary hover:bg-primary/15 sm:opacity-0 sm:group-hover/header:opacity-100")}
            title="Rename group"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </>
      )}

      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
        {!paletteMode && dueCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent-strong font-semibold">{dueCount} due</span>
        )}
        <p className={cn("text-xs tabular-nums", !paletteMode && "text-primary/70")}>{wordCount} items</p>

        {/* Delete group — shows confirm inline */}
        {confirmingDelete ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-destructive font-semibold">Delete {wordCount} words?</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteGroup(dateKey); setConfirmingDelete(false); }}
              className="px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/80 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
              className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs font-bold hover:bg-muted/80 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
            className={cn("p-1 rounded-md transition-colors flex-shrink-0", paletteMode ? "hover:bg-current/10" : "text-primary/50 hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover/header:opacity-100")}
            title="Delete all words in this group"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LibraryTab({ setActiveTab, onStartReview, showVocabularySummary = false }: { setActiveTab: (tab: SidebarTab) => void; onStartReview?: (dateKey?: string) => void; showVocabularySummary?: boolean }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const stickyToolsRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<VocabularyStage | null>(null);
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showDrivePanel, setShowDrivePanel] = useState(false);
  const [filterStarred, setFilterStarred] = useState(false);
  // Track which groups are collapsed; default: all open
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Inline word editing.
  const [editId, setEditId] = useState<number | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editTranslation, setEditTranslation] = useState("");
  const utils = trpc.useUtils();

  // ─── Date index rail ────────────────────────────────────────────────────────
  // Jump-to targets for each group, plus which one is currently in view so the
  // rail can highlight it as you scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Positioned from bounding rects rather than scrollIntoView: the group sits
  // several levels inside a nested flex/overflow tree, and this keeps the maths
  // independent of which ancestor happens to be the offsetParent. Jumps are
  // instant — smooth behaviour is silently dropped in some environments, which
  // would leave the rail looking dead rather than merely un-animated.
  const scrollToGroup = (key: string) => {
    if (showVocabularySummary) setExpandedGroups((old) => new Set([...Array.from(old), key]));
    requestAnimationFrame(() => {
      const el = groupRefs.current[key];
      const scroller = scrollRef.current;
      if (!el || !scroller) return;
      const inset = showVocabularySummary ? stickyToolsRef.current?.offsetHeight ?? 0 : 0;
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - inset - 8;
      setActiveGroup(key);
    });
  };

  const { data: words = [], isLoading } = trpc.vocab.list.useQuery();

  const deleteMutation = trpc.vocab.delete.useMutation({
    onError: () => toast.error("Failed to delete"),
  });

  const updateMutation = trpc.vocab.update.useMutation({
    onSuccess: () => utils.vocab.list.invalidate(),
    onError: () => toast.error("Failed to save changes"),
  });

  const startEdit = (w: { id: number; term: string; translation: string }) => {
    setEditId(w.id);
    setEditTerm(w.term);
    setEditTranslation(w.translation);
  };
  const cancelEdit = () => setEditId(null);
  const saveEdit = async (id: number) => {
    const term = editTerm.trim(), translation = editTranslation.trim();
    if (!term || !translation) { toast.error("Both fields are required"); return; }
    await updateMutation.mutateAsync({ id, term, translation });
    setEditId(null);
  };

  const starMutation = trpc.vocab.toggleStar.useMutation({
    onMutate: async ({ id }) => {
      await utils.vocab.list.cancel();
      const prev = utils.vocab.list.getData();
      utils.vocab.list.setData(undefined, (old) =>
        old?.map((w) => (w.id === id ? { ...w, starred: !w.starred } : w))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) utils.vocab.list.setData(undefined, ctx.prev); },
    onSettled: () => utils.vocab.list.invalidate(),
  });

  const renameGroupMutation = trpc.vocab.renameGroup.useMutation({
    onMutate: async ({ oldDateKey, newDateKey }) => {
      await utils.vocab.list.cancel();
      const prev = utils.vocab.list.getData();
      // Optimistically update all words in the old group
      utils.vocab.list.setData(undefined, (old) =>
        old?.map((w) => w.dateKey === oldDateKey ? { ...w, dateKey: newDateKey } : w)
      );
      // Update collapsed state to track new key
      setCollapsed((c) => {
        const next = new Set(c);
        if (next.has(oldDateKey)) { next.delete(oldDateKey); next.add(newDateKey); }
        return next;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.vocab.list.setData(undefined, ctx.prev);
      toast.error("Failed to rename group");
    },
    onSuccess: () => {
      utils.vocab.list.invalidate();
      toast.success("Group renamed");
    },
  });

  const bulkAddMutation = trpc.vocab.bulkAdd.useMutation({
    onSuccess: (data) => {
      utils.vocab.list.invalidate();
      toast.success(`Added ${data.count} words to your library!`);
    },
    onError: () => toast.error("Import failed"),
  });

  const handleImport = (items: ImportItem[], lessonName: string) => {
    bulkAddMutation.mutate(
      items.map((item) => ({
        term: item.term,
        translation: item.translation,
        entryKind: (item.kind ?? item.entryKind ?? "word") as "word" | "phrase",
        lessonSource: lessonName || undefined,
        dateKey: item.dateKey ?? todayKey(),
      }))
    );
  };

  const handleDelete = (id: number) => {
    const prev = utils.vocab.list.getData();
    utils.vocab.list.setData(undefined, (old) => old?.filter((w) => w.id !== id));
    deleteMutation.mutate(
      { id },
      {
        onError: () => {
          if (prev) utils.vocab.list.setData(undefined, prev);
          toast.error("Failed to delete");
        },
      }
    );
  };

  const toggleCollapse = (key: string) => {
    if (showVocabularySummary) {
      setExpandedGroups((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });
      return;
    }
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleRename = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    renameGroupMutation.mutate({ oldDateKey: oldKey, newDateKey: newKey });
  };

  const deleteGroupMutation = trpc.vocab.deleteGroup.useMutation({
    onMutate: async ({ dateKey }) => {
      await utils.vocab.list.cancel();
      const prev = utils.vocab.list.getData();
      utils.vocab.list.setData(undefined, (old) => old?.filter((w) => w.dateKey !== dateKey));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.vocab.list.setData(undefined, ctx.prev);
      toast.error("Failed to delete group");
    },
    onSuccess: (_data, vars) => {
      utils.vocab.list.invalidate();
      toast.success(`Deleted all words from "${fmtDateLabel(vars.dateKey)}"`);
    },
  });

  const handleDeleteGroup = (dateKey: string) => {
    deleteGroupMutation.mutate({ dateKey });
  };

  // Filter and group
  const filtered = words.filter((w) => {
    if (showVocabularySummary && statusFilter && vocabularyStage(w) !== statusFilter) return false;
    if (filterStarred && !w.starred) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return w.term.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q);
  });

  const grouped = filtered.reduce<Record<string, VocabEntry[]>>((acc, w) => {
    const key = w.dateKey;
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {});

  // Sort groups newest-first by actual date value; custom labels sort to the bottom.
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const av = dateKeyToSortValue(a);
    const bv = dateKeyToSortValue(b);
    // Both are real dates: sort descending (newest first)
    if (av !== -1 && bv !== -1) return bv - av;
    // One is a custom label: real dates come before custom labels
    if (av !== -1) return -1;
    if (bv !== -1) return 1;
    // Both custom labels: alphabetical
    return a.localeCompare(b);
  });

  const dueCount = words.filter((w) => isDue(w)).length;

  // Scroll-spy for the rail. The rootMargin pins "current" to whatever group has
  // just reached the top of the viewport rather than whatever is merely visible,
  // which is what reads correctly while scrolling.
  const groupKeysSignature = sortedGroups.map(([k]) => k).join("|");
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const atTop = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const key = atTop?.target.getAttribute("data-group-key");
        if (key) setActiveGroup(key);
      },
      { root, rootMargin: "0px 0px -75% 0px", threshold: 0 }
    );
    Object.values(groupRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [groupKeysSignature]);

  const summaryActionClass = "inline-flex items-center justify-center gap-2 min-h-10 px-3 py-2 rounded-xl bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const libraryActions = (
        <div className={cn("w-full flex items-center gap-2 flex-wrap", !showVocabularySummary && "max-w-3xl mx-auto justify-between")}>
          {!showVocabularySummary && <button
            onClick={() => setFilterStarred(!filterStarred)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all",
              filterStarred ? "bg-amber-600 ring-2 ring-amber-400/60" : "bg-amber-500 hover:bg-amber-600"
            )}
          >
            <Star className={cn("w-3.5 h-3.5", filterStarred && "fill-current")} /> Starred
          </button>}
          {!showVocabularySummary && dueCount > 0 && (
            <span className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm">
              {dueCount} due
            </span>
          )}
          <button
            onClick={() => exportCSV(words)}
            disabled={!words.length}
            className={showVocabularySummary ? summaryActionClass : "flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-40"}
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button
            onClick={() => setShowImport(true)}
            className={showVocabularySummary ? summaryActionClass : "flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm transition-colors"}
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button
            onClick={() => setShowDrivePanel(!showDrivePanel)}
            aria-expanded={showDrivePanel}
            className={showVocabularySummary ? cn(summaryActionClass, showDrivePanel && "bg-primary/15") : cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-card shadow-sm transition-all",
              showDrivePanel
                ? "text-blue-700 border border-blue-500/60 ring-2 ring-blue-400/40"
                : "text-foreground border border-border hover:bg-muted/50"
            )}
            title="Google Drive Sync"
          >
            {/* Google Drive's own mark, full colour — same asset as the panel. */}
            <svg width="14" height="14" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
            Drive
          </button>
        </div>
  );
  const libraryCalendar = (
    <>
              <VocabHeatmap
                tone={showVocabularySummary ? "blue" : "green"}
                stretch={showVocabularySummary}
                dates={sortedGroups
                  .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                  .map(([k, ws]) => ({ dateKey: k, total: ws.length }))}
                onPick={(dk) => scrollToGroup(dk)}
                selectedKey={activeGroup}
                idleLabel={showVocabularySummary ? "Saved words · pick a day" : "Jump to a day you saved words"}
              />
              {/* Renamed groups have no date to sit on, so they keep their own
                  row rather than becoming unreachable. */}
              {sortedGroups.some(([k]) => !/^\d{4}-\d{2}-\d{2}$/.test(k)) && (
                <div className="flex flex-wrap gap-1.5 justify-center mt-3 pt-3 border-t border-border">
                  {sortedGroups
                    .filter(([k]) => !/^\d{4}-\d{2}-\d{2}$/.test(k))
                    .map(([k, ws]) => (
                      <button
                        key={k}
                        onClick={() => scrollToGroup(k)}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-xs font-semibold transition-colors",
                          activeGroup === k
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {fmtDateLabel(k)} <span className="opacity-70 tabular-nums">{ws.length}</span>
                      </button>
                    ))}
                </div>
              )}
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {!showVocabularySummary && (
        <div className="flex-shrink-0 min-h-14 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-2 flex items-center">
          {libraryActions}
        </div>
      )}

      {/* Google Drive Panel */}
      {!showVocabularySummary && showDrivePanel && (
        <div className="flex-shrink-0 border-b border-border px-4 py-4 bg-background/50">
          <GoogleDrivePanel onStartReview={onStartReview} />
        </div>
      )}

      {/* The summary layout scrolls the summary and list together; the standard
          library keeps its pinned calendar and search. */}
      <div ref={showVocabularySummary ? scrollRef : undefined} className={cn("flex-1 flex flex-col min-h-0", showVocabularySummary && "overflow-y-auto")}>
        {showVocabularySummary && !isLoading && (
          <div className="flex-shrink-0 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4">
            <div className={cn("mx-auto", !showVocabularySummary && "max-w-3xl")}>
              <VocabularySummary
                words={words}
                selected={statusFilter}
                onSelect={setStatusFilter}
                actions={<>
                  {libraryActions}
                  {showDrivePanel && <div className="mt-3"><GoogleDrivePanel onStartReview={onStartReview} /></div>}
                </>}
                joined
              />

            </div>
          </div>
        )}
        {!showVocabularySummary && !isLoading && words.length > 0 && sortedGroups.length > 1 && (
          <div className="flex-shrink-0 border-b border-border px-4 py-3">
            <div className={cn("mx-auto", !showVocabularySummary && "max-w-3xl")}>{libraryCalendar}</div>
          </div>
        )}

      <div ref={stickyToolsRef} className={cn("flex-shrink-0", showVocabularySummary && "sticky top-0 z-20 w-full max-w-5xl mx-auto px-4 sm:px-6")}>
        <div className={showVocabularySummary ? "bg-background rounded-b-3xl pt-3 pb-1 text-[#1D1D1B]" : undefined}>
          {showVocabularySummary && !isLoading && libraryCalendar}
      {/* Starred is a list filter, so it sits beside search in the summary view. */}
      {!isLoading && words.length > 0 && (
        <div className={cn("flex-shrink-0 pt-3 pb-2", !showVocabularySummary && "px-4")}>
          <div className={cn("mx-auto flex items-center gap-2", showVocabularySummary ? "border-b border-black/20 py-2" : "max-w-3xl")}>
            <div className="relative flex-1 min-w-0">
            <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none", showVocabularySummary ? "left-0 text-[#1D1D1B]" : "left-3 text-muted-foreground")} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (showVocabularySummary) setExpandedGroups(e.target.value.trim() ? new Set(words.map((word) => word.dateKey)) : new Set()); }}
              aria-label="Search vocabulary"
              placeholder={showVocabularySummary ? "Search your vocabulary…" : "Search your library…"}
              className={showVocabularySummary ? "w-full pl-8 pr-3 min-h-11 bg-transparent text-base text-[#1D1D1B] placeholder:text-black/60 focus-visible:outline-2 focus-visible:outline-primary" : "w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"}
            />
            </div>
            {showVocabularySummary && (
              <button type="button" aria-label="Filter starred words" aria-pressed={filterStarred} onClick={() => setFilterStarred(!filterStarred)} className={cn("shrink-0 flex items-center justify-center gap-2 min-h-11 px-2 rounded-md text-sm focus-visible:outline-2 focus-visible:outline-primary", filterStarred ? "bg-[#282828] text-white" : "text-[#1D1D1B] hover:bg-black/5")}>
                <Star className={cn("w-4 h-4", filterStarred && "fill-current")} /><span className="hidden sm:inline">Starred</span>
              </button>
            )}
          </div>
        </div>
      )}

          {showVocabularySummary && !isLoading && (            <div className="flex items-center justify-between py-4">
              <p className="text-sm text-[#1D1D1B]">{filtered.length} of {words.length} items</p>
              <div className="flex gap-2">
                <button
                  onClick={() => showVocabularySummary ? setExpandedGroups(new Set()) : setCollapsed(new Set(sortedGroups.map(([k]) => k)))}
                  className="text-sm text-[#1D1D1B] hover:text-foreground transition-colors"
                >
                  Fold all
                </button>
                <span className="text-black/40">·</span>
                <button
                  onClick={() => showVocabularySummary ? setExpandedGroups(new Set(sortedGroups.map(([k]) => k))) : setCollapsed(new Set())}
                  className="text-sm text-[#1D1D1B] hover:text-foreground transition-colors"
                >
                  Unfold all
                </button>
              </div>
            </div>)}
        </div>
      </div>

      <div ref={showVocabularySummary ? undefined : scrollRef} className={cn("px-4 pb-4 pt-1", showVocabularySummary ? "flex-shrink-0 sm:px-6 w-full max-w-5xl mx-auto" : "flex-1 overflow-y-auto")}>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">📚</p>
            <p className="text-lg font-semibold text-foreground mb-2">Your library is empty</p>
            <p className="text-sm text-muted-foreground mb-6">Search words in the Dictionary, or import from lesson notes.</p>
            <button
              onClick={() => setShowImport(true)}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
            >
              Import Lesson Notes
            </button>
          </div>
        ) : (
          <div className={cn("mx-auto", showVocabularySummary ? "isolate space-y-0" : "max-w-3xl space-y-3")}>
            {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-muted-foreground text-sm">No words match your search</p>
            </div>
            ) : (
            <>
            {!showVocabularySummary && (            <div className="flex items-center justify-between py-4">
              <p className="text-xs text-muted-foreground">{filtered.length} of {words.length} words</p>
              <div className="flex gap-2">
                <button
                  onClick={() => showVocabularySummary ? setExpandedGroups(new Set()) : setCollapsed(new Set(sortedGroups.map(([k]) => k)))}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Collapse all
                </button>
                <span className="text-muted-foreground/40">·</span>
                <button
                  onClick={() => showVocabularySummary ? setExpandedGroups(new Set(sortedGroups.map(([k]) => k))) : setCollapsed(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Expand all
                </button>
              </div>
            </div>)}

            {sortedGroups.map(([dateKey, dayWords]) => {
              const isOpen = showVocabularySummary ? expandedGroups.has(dateKey) : !collapsed.has(dateKey);
              const groupDue = dayWords.filter(isDue).length;
              return (
                <div
                  key={dateKey}
                  ref={(el) => { groupRefs.current[dateKey] = el; }}
                  data-group-key={dateKey}
                  className={cn("overflow-hidden scroll-mt-4", showVocabularySummary ? "relative bg-background text-foreground border-b border-foreground/15" : "bg-card card-float rounded-2xl")}
                >
                  <GroupHeader
                    paletteMode={showVocabularySummary}
                    dateKey={dateKey}
                    wordCount={dayWords.length}
                    dueCount={groupDue}
                    isOpen={isOpen}
                    onToggle={() => toggleCollapse(dateKey)}
                    onRename={handleRename}
                    onDeleteGroup={handleDeleteGroup}
                  />

                  {isOpen && (
                    <div className={showVocabularySummary ? "space-y-2 px-3 sm:px-5 pb-6" : "divide-y divide-border/50"}>
                      {dayWords.map((w) => showVocabularySummary ? (
                        <LibraryPaletteWord
                          key={w.id}
                          word={w}
                          swatch={{ background: "var(--card)", color: "var(--foreground)" }}
                          onSave={(term, translation) => updateMutation.mutateAsync({ id: w.id, term, translation })}
                          onStar={() => starMutation.mutate({ id: w.id })}
                          onDelete={() => handleDelete(w.id)}
                        />
                      ) : (
                        <div
                          key={w.id}
                          className="flex items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors group"
                        >
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0",
                            w.entryKind === "phrase"
                              ? "bg-violet-500/15 text-violet-700"
                              : "bg-primary/15 text-primary"
                          )}>
                            {w.entryKind === "phrase" ? "📝" : "📖"}
                          </span>
                          {editId === w.id ? (
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <input
                                  value={editTerm}
                                  onChange={(e) => setEditTerm(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(w.id); if (e.key === "Escape") cancelEdit(); }}
                                  placeholder="French"
                                  autoFocus
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-primary/50 bg-card text-sm font-semibold text-foreground focus:outline-none focus:border-primary"
                                />
                                <input
                                  value={editTranslation}
                                  onChange={(e) => setEditTranslation(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(w.id); if (e.key === "Escape") cancelEdit(); }}
                                  placeholder="English meaning"
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground focus:outline-none focus:border-primary"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-3">
                                <p className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">{w.term}</p>
                                {/* Fixed-width, left-aligned: meanings form a real
                                    column instead of a ragged right-aligned edge. */}
                                <p className="text-xs text-muted-foreground truncate w-32 sm:w-40 md:w-52 flex-shrink-0">{w.translation}</p>
                              </div>
                              {w.groupLabel && (
                                <p className="text-xs text-blue-700/80 truncate mt-0.5">🏷 {w.groupLabel}</p>
                              )}
                              {w.lessonSource && (
                                <p className="text-xs text-primary/70 truncate mt-0.5">📌 {w.lessonSource}</p>
                              )}
                            </div>
                          )}
                          {/* Badge slot: fixed width whether it holds two chips
                              or none, so the meaning column left of it never
                              shifts row to row. */}
                          <span className="flex items-center justify-end gap-1 w-28 flex-shrink-0">
                            {w.sm2Status && w.sm2Status !== "new" && (
                              <span className={cn(
                                "text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0",
                                w.sm2Status === "mastered" && "bg-green-500/15 text-green-700",
                                w.sm2Status === "review" && "bg-blue-500/15 text-blue-700",
                                w.sm2Status === "learning" && "bg-yellow-500/15 text-amber-700",
                              )}>
                                {w.sm2Status === "mastered" ? "✓ mastered" : w.sm2Status === "review" ? "review" : "learning"}
                              </span>
                            )}
                            {w.sm2NextReviewAt && w.sm2NextReviewAt <= Date.now() && w.sm2Status !== "mastered" && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent-strong font-semibold flex-shrink-0">
                                due
                              </span>
                            )}
                          </span>
                          {editId === w.id ? (
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => saveEdit(w.id)}
                                disabled={updateMutation.isPending}
                                className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                                title="Save"
                              >
                                {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => startEdit(w)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                title="Edit word"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => starMutation.mutate({ id: w.id })}
                                className={cn(
                                  "p-1.5 rounded-lg transition-colors",
                                  w.starred
                                    ? "text-star"
                                    : "text-muted-foreground hover:text-star sm:opacity-0 sm:group-hover:opacity-100"
                                )}
                              >
                                <Star className={cn("w-3.5 h-3.5", w.starred && "fill-current")} />
                              </button>
                              <button
                                onClick={() => handleDelete(w.id)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                title="Delete word"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            </>
            )}
          </div>
        )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}
    </div>
  );
}
