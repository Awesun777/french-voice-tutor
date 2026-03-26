import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { ImportItem } from "@/types";
import { X, Loader2, ChevronDown, ChevronUp, Upload, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImportModalProps {
  onClose: () => void;
  onImport: (items: ImportItem[], lessonName: string) => void;
}

function parseCSV(text: string): ImportItem[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const header = lines[0]?.toLowerCase() ?? "";
  if (!header.includes("french") && !header.includes("english")) return [];
  const items: ImportItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].match(/("([^"]*(?:""[^"]*)*)"|[^,]*),?/g)
      ?.map((p) => p.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
    if (parts.length >= 2 && parts[0].trim()) {
      const term = parts[0].trim();
      items.push({
        term,
        translation: (parts[1] ?? "").trim(),
        kind: term.split(/\s+/).length >= 3 ? "phrase" : "word",
      });
    }
  }
  return items;
}

export default function ImportModal({ onClose, onImport }: ImportModalProps) {
  const [phase, setPhase] = useState<"pick" | "loading" | "review" | "done">("pick");
  const [inputMode, setInputMode] = useState<"paste" | "csv">("paste");
  const [pasteText, setPasteText] = useState("");
  const [lessonName, setLessonName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [kept, setKept] = useState<ImportItem[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [corrections, setCorrections] = useState<{ original: string; fixed: string; note: string }[]>([]);
  const [showCorrections, setShowCorrections] = useState(false);
  const [history, setHistory] = useState<{ idx: number; keptSnap: ImportItem[] }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const extractMutation = trpc.import.extractFromText.useMutation({
    onSuccess: (data) => {
      const tagged: ImportItem[] = data.items.map((item: any) => ({
        term: item.term,
        translation: item.translation,
        kind: (item.kind === "phrase" ? "phrase" : "word") as "word" | "phrase",
      }));
      if (!tagged.length) { setError("No French vocabulary found. Try pasting more content."); setPhase("pick"); return; }
      setItems(tagged);
      setCorrections(data.corrections ?? []);
      setReviewIdx(0);
      setKept([]);
      setSkipped(0);
      setPhase("review");
    },
    onError: (err) => { setError(err.message); setPhase("pick"); },
  });

  const handlePaste = async () => {
    if (!pasteText.trim()) return;
    setError(null);
    setPhase("loading");
    extractMutation.mutate({ text: pasteText, instructions: instructions || undefined });
  };

  const handleCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed.length) { setError("No valid words found in CSV. Ensure columns are French and English."); return; }
      setItems(parsed);
      setReviewIdx(0);
      setKept([]);
      setSkipped(0);
      setPhase("review");
    };
    reader.readAsText(file);
  };

  const advance = () => {
    if (reviewIdx + 1 >= items.length) setPhase("done");
    else setReviewIdx((i) => i + 1);
  };

  const handleKeep = () => {
    setHistory((h) => [...h, { idx: reviewIdx, keptSnap: kept }]);
    setKept((prev) => [...prev, items[reviewIdx]]);
    advance();
  };

  const handleSkip = () => {
    setHistory((h) => [...h, { idx: reviewIdx, keptSnap: kept }]);
    setSkipped((s) => s + 1);
    advance();
  };

  const handleBack = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setReviewIdx(last.idx);
    setKept(last.keptSnap);
  };

  const handleFinish = () => {
    onImport(kept, lessonName.trim());
    onClose();
  };

  const currentItem = items[reviewIdx];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="font-bold text-foreground">Import Vocabulary</p>
            <p className="text-xs text-muted-foreground mt-0.5">AI extracts every French word and phrase</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pick phase */}
        {phase === "pick" && (
          <>
            <div className="flex border-b border-border flex-shrink-0">
              {[{ id: "paste", label: "📋 Paste Text" }, { id: "csv", label: "📊 CSV Upload" }].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setInputMode(m.id as "paste" | "csv")}
                  className={cn(
                    "flex-1 py-3 text-xs font-bold transition border-b-2",
                    inputMode === m.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">⚠ {error}</p>
              )}
              <input
                value={lessonName}
                onChange={(e) => setLessonName(e.target.value)}
                placeholder="Lesson name (optional)"
                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              {inputMode === "paste" ? (
                <div className="space-y-3">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={8}
                    placeholder="Paste your French lesson notes, vocabulary list, or any French text here…"
                    className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                  />
                  <button
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Custom instructions
                  </button>
                  {showInstructions && (
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={3}
                      placeholder="e.g. Focus only on verbs, or include only words I don't know yet…"
                      className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                    />
                  )}
                  <button
                    onClick={handlePaste}
                    disabled={!pasteText.trim()}
                    className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-semibold transition-colors"
                  >
                    Extract Vocabulary with AI
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Upload a CSV with columns: French, English (and optionally Type, Date)</p>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCSV(f); }} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full py-8 border-2 border-dashed border-border hover:border-primary/50 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors flex flex-col items-center gap-2"
                  >
                    <Upload className="w-6 h-6" />
                    Click to upload CSV file
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Loading phase */}
        {phase === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-semibold text-foreground">Processing your text…</p>
              <p className="text-sm text-muted-foreground mt-1">Correcting typos and extracting vocabulary</p>
            </div>
          </div>
        )}

        {/* Review phase */}
        {phase === "review" && currentItem && (
          <>
            {corrections.length > 0 && (
              <div className="border-b border-amber-800/40 bg-amber-950/30 flex-shrink-0">
                <button
                  onClick={() => setShowCorrections(!showCorrections)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-950/50 transition-colors"
                >
                  <span className="text-xs font-semibold text-amber-300">✏️ {corrections.length} correction{corrections.length !== 1 ? "s" : ""} applied</span>
                  <span className="text-amber-500 text-xs">{showCorrections ? "▲" : "▼"}</span>
                </button>
                {showCorrections && (
                  <div className="px-4 pb-3 space-y-1">
                    {corrections.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-red-400 line-through font-mono">{c.original}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-emerald-400 font-mono font-semibold">{c.fixed}</span>
                        {c.note && <span className="text-muted-foreground italic">({c.note})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="p-5 flex-1 overflow-y-auto">
              {/* Progress */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={handleBack} disabled={!history.length} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-muted-foreground">{reviewIdx + 1} / {items.length}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-emerald-400 font-semibold">{kept.length} kept</span>
                  <span>{skipped} skipped</span>
                </div>
              </div>
              <div className="h-1 bg-muted rounded-full mb-5">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((reviewIdx) / items.length) * 100}%` }} />
              </div>

              {/* Card */}
              <div className="bg-muted/40 border border-border rounded-2xl p-6 text-center mb-5">
                <span className={cn(
                  "inline-block text-xs px-2.5 py-1 rounded-full font-bold mb-3",
                  currentItem.kind === "phrase" ? "bg-violet-500/15 text-violet-400" : "bg-primary/15 text-primary"
                )}>
                  {currentItem.kind === "phrase" ? "📝 Phrase" : "📖 Word"}
                </span>
                <p className="text-2xl font-bold text-foreground mb-2">{currentItem.term}</p>
                <p className="text-muted-foreground">{currentItem.translation}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={handleSkip} className="flex-1 py-2.5 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl text-sm font-semibold transition-colors">
                  Skip →
                </button>
                <button onClick={handleKeep} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-semibold transition-colors">
                  Keep ✓
                </button>
              </div>
            </div>
          </>
        )}

        {/* Done phase */}
        {phase === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4 text-center">
            <p className="text-5xl">🎉</p>
            <div>
              <p className="text-xl font-bold text-foreground">{kept.length} words selected</p>
              <p className="text-sm text-muted-foreground mt-1">{skipped} skipped</p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => { setPhase("review"); setReviewIdx(0); setKept([]); setSkipped(0); }} className="flex-1 py-2.5 bg-muted/50 hover:bg-muted text-muted-foreground rounded-xl text-sm font-semibold transition-colors">
                Start over
              </button>
              <button onClick={handleFinish} disabled={!kept.length} className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl text-sm font-semibold transition-colors">
                Add {kept.length} to Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
