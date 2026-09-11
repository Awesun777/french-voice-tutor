import { useState } from "react";
import { Check, Copy, Pencil, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { vocabularyStage } from "@/lib/vocabularySummary";
import type { VocabEntry } from "@/types";
import type { Swatch } from "./VocabularyStatusBlocks";

export default function LibraryPaletteWord({ word, swatch, onSave, onStar, onDelete }: {
  word: VocabEntry;
  swatch: Swatch;
  onSave: (term: string, translation: string) => Promise<unknown>;
  onStar: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState(word.term);
  const [translation, setTranslation] = useState(word.translation);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const startEditing = () => {
    setTerm(word.term);
    setTranslation(word.translation);
    setEditing(true);
  };
  const termClass = "text-2xl sm:text-3xl font-medium leading-tight tracking-tight break-words";
  const meaningClass = "text-base leading-6 break-words";
  const editorClass = "col-start-1 row-start-1 w-full min-w-0 resize-none overflow-hidden border-0 rounded-none bg-transparent p-0 text-inherit shadow-[0_1px_0_0_rgba(0,0,0,0.2)] focus:shadow-[0_1px_0_0_var(--primary)] focus:outline-none";
  const save = async () => {
    if (!term.trim() || !translation.trim()) { toast.error("Both fields are required"); return; }
    setSaving(true);
    try { await onSave(term.trim(), translation.trim()); setEditing(false); }
    catch { /* The existing mutation displays the save error. */ }
    finally { setSaving(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${word.term} — ${word.translation}`); setCopied(true); }
    catch { toast.error("Couldn't copy this word"); }
  };
  const actionClass = "flex h-9 w-9 items-center justify-center rounded-md hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current disabled:opacity-50";
  return <article style={swatch} className="min-h-[7.5rem] rounded-xl px-4 sm:px-5 py-3">
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex-1 min-w-0 basis-56">
        {editing ? <div onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }}>
          <div className={cn("grid", termClass)}>
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre-wrap">{term + " "}</span>
            <textarea rows={1} autoFocus aria-label="French" value={term} onChange={(event) => setTerm(event.target.value)} className={cn(editorClass, termClass)} />
          </div>
          <div className={cn("grid mt-1", meaningClass)}>
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre-wrap">{translation + " "}</span>
            <textarea rows={1} aria-label="English meaning" value={translation} onChange={(event) => setTranslation(event.target.value)} className={cn(editorClass, meaningClass)} />
          </div>
        </div> : <>
          <h3 onDoubleClick={startEditing} title="Double-click to edit" className={termClass}>{word.term}</h3>
          <p onDoubleClick={startEditing} className={cn(meaningClass, "mt-1")}>{word.translation}</p>
        </>}
      </div>
      <div className="flex w-[9.375rem] shrink-0 items-center justify-end gap-0.5">
        {editing ? <>
          <button type="button" aria-label="Save word" disabled={saving} onClick={save} className={actionClass}><Check className="h-4 w-4" /></button>
          <button type="button" aria-label="Cancel editing" disabled={saving} onClick={() => setEditing(false)} className={actionClass}><X className="h-4 w-4" /></button>
        </> : <>
          <button type="button" aria-label={`Copy ${word.term}`} onClick={copy} className={actionClass}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
          <button type="button" aria-label={`Edit ${word.term}`} onClick={startEditing} className={actionClass}><Pencil className="h-4 w-4" /></button>
          <button type="button" aria-label={`Star ${word.term}`} aria-pressed={word.starred} onClick={onStar} className={actionClass}><Star className={cn("h-4 w-4", word.starred && "fill-current")} /></button>
          <button type="button" aria-label={`Delete ${word.term}`} onClick={onDelete} className={actionClass}><Trash2 className="h-4 w-4" /></button>
        </>}
      </div>
    </div>
    <div className="flex flex-wrap justify-between gap-2 mt-2 text-xs">
      <span className="min-w-0 break-words">{word.lessonSource || word.groupLabel || word.entryKind}</span>
      <span className="capitalize">{vocabularyStage(word)}</span>
    </div>
    <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
  </article>;
}
