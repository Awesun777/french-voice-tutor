/**
 * What the active tab is showing right now — the fallback context for the
 * voice-ask palette (Shift+Return) when the user hasn't selected any text.
 * "Can you break down the sentence?" asked over a flashcard means THAT card;
 * the flashcard/quiz/video components publish their current item here and
 * the palette picks it up at keypress time.
 *
 * Module-level rather than React context: Home.tsx binds its key handler
 * once and reads this imperatively when the chord fires. An explicit text
 * selection always wins over the published screen context.
 */
let current: string | null = null;

export function setScreenContext(text: string | null): void {
  current = text && text.trim() ? text.trim().slice(0, 500) : null;
}

export function getScreenContext(): string | null {
  return current;
}
