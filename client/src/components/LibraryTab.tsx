import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { VocabEntry, SidebarTab, ImportItem } from "@/types";
import { Star, Trash2, Search, Download, Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ImportModal from "./ImportModal";

function todayKey() { return new Date().toISOString().split("T")[0]; }
function yesterdayKey() { return new Date(Date.now() - 86400000).toISOString().split("T")[0]; }
function fmtDateLabel(dateKey: string) {
  if (dateKey === todayKey()) return "Today";
  if (dateKey === yesterdayKey()) return "Yesterday";
  return new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  a.href = url;
  a.download = "french_vocabulary.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export default function LibraryTab({ setActiveTab }: { setActiveTab: (tab: SidebarTab) => void }) {
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [filterStarred, setFilterStarred] = useState(false);
  const utils = trpc.useUtils();

  const { data: words = [], isLoading } = trpc.vocab.list.useQuery();

  const deleteMutation = trpc.vocab.delete.useMutation({
    onSuccess: () => { utils.vocab.list.invalidate(); toast.success("Removed"); },
    onError: () => toast.error("Failed to delete"),
  });

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
        dateKey: todayKey(),
      }))
    );
  };

  // Filter and group
  const filtered = words.filter((w) => {
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

  const dueCount = words.filter((w) => isDue(w)).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your library…"
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterStarred(!filterStarred)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
                filterStarred ? "bg-accent/20 text-accent" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Star className="w-3.5 h-3.5" /> Starred
            </button>
            {dueCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold">
                {dueCount} due
              </span>
            )}
            <button
              onClick={() => exportCSV(words)}
              disabled={!words.length}
              className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl text-xs font-semibold transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-muted-foreground text-sm">No words match your search</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <p className="text-xs text-muted-foreground">{filtered.length} of {words.length} words</p>
            {Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([dateKey, dayWords]) => (
                <div key={dateKey} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{fmtDateLabel(dateKey)}</p>
                    <p className="text-xs text-muted-foreground">{dayWords.length} items</p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {dayWords.map((w) => (
                      <div key={w.id} className="flex items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors group">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0",
                          w.entryKind === "phrase" ? "bg-violet-500/15 text-violet-400" : "bg-primary/15 text-primary"
                        )}>
                          {w.entryKind === "phrase" ? "📝" : "📖"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{w.term}</p>
                          <p className="text-xs text-muted-foreground truncate">{w.translation}</p>
                          {w.lessonSource && (
                            <p className="text-xs text-primary/70 truncate mt-0.5">📌 {w.lessonSource}</p>
                          )}
                        </div>
                        {isDue(w) && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold flex-shrink-0">due</span>
                        )}
                        {confirmDelete === w.id ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => { deleteMutation.mutate({ id: w.id }); setConfirmDelete(null); }}
                              className="px-2.5 py-1 rounded-lg bg-destructive hover:bg-destructive/80 text-destructive-foreground text-xs font-bold transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2.5 py-1 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-semibold transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => starMutation.mutate({ id: w.id })}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                w.starred ? "text-accent" : "text-muted-foreground hover:text-accent opacity-0 group-hover:opacity-100"
                              )}
                            >
                              <Star className={cn("w-3.5 h-3.5", w.starred && "fill-current")} />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(w.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
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
