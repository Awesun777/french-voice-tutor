/**
 * AccentKeyboard — a compact strip of French accented characters that inserts
 * the tapped character at the caret position of a target input, so users on an
 * English keyboard can type accents accurately. Render it below a search bar
 * behind a toggle; it only contains the accents, not a full keyboard.
 */
import { cn } from "@/lib/utils";

const ACCENTS = ["à", "â", "ç", "é", "è", "ê", "ë", "î", "ï", "ô", "œ", "ù", "û", "ü"];

export function AccentKeyboard({
  inputRef,
  value,
  onChange,
  className,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const insert = (ch: string) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Native insertText fires an input event React's onChange picks up, and
    // keeps the caret right after the inserted character (a manual
    // value-splice loses the caret when the controlled re-render lands).
    if (!document.execCommand("insertText", false, ch)) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + ch + value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + ch.length, start + ch.length);
      });
    }
  };

  return (
    <div className={cn("flex gap-1.5 overflow-x-auto scrollbar-none", className)}>
      {ACCENTS.map((ch) => (
        <button
          key={ch}
          type="button"
          // Keep focus (and caret position) in the input while tapping accents
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(ch)}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-muted hover:bg-primary/15 hover:text-primary text-foreground border border-border rounded-lg text-sm font-medium transition-colors"
        >
          {ch}
        </button>
      ))}
    </div>
  );
}
