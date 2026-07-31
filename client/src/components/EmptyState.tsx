/**
 * EmptyState — one shared treatment for every "nothing here yet" screen.
 *
 * These used to be bare emoji on the page background with no colour at all,
 * which left the app's emptiest moments — including the Dictionary, its default
 * first screen — as flat cream. This wraps them in a tinted panel with an emoji
 * medallion, mirroring the stat-card medallions in ProgressTab.
 *
 * The tone varies per tab on purpose: it adds colour exactly where the UI is
 * otherwise least colourful.
 */

import { cn } from "@/lib/utils";

export type EmptyStateTone = "blue" | "rose" | "gold";

/**
 * Tints are built from the palette's *light* colours, not low-alpha dark ones.
 * A saturated blue at 10% over warm cream neutralises to grey (#5CA8D6/10 over
 * #FFF8ED lands on ~#EFF0EB), which is exactly the drabness this is meant to
 * fix. Pale blue and rose mist are already light, so they stay themselves.
 */
const TONES: Record<EmptyStateTone, { panel: string; medallion: string }> = {
  blue: { panel: "bg-secondary/80 border-chrome-border", medallion: "bg-accent/30" },
  rose: { panel: "bg-speaking-surface/70 border-speaking/20", medallion: "bg-speaking/15" },
  gold: { panel: "bg-star/10 border-star/30", medallion: "bg-star/20" },
};

interface EmptyStateProps {
  emoji: string;
  title: string;
  description?: string;
  tone?: EmptyStateTone;
  /** Optional call-to-action rendered under the description. */
  action?: React.ReactNode;
  /** Extra classes on the outer panel (spacing, max-width overrides). */
  className?: string;
  /** Compact variant for secondary states like "no search matches". */
  compact?: boolean;
}

export function EmptyState({
  emoji,
  title,
  description,
  tone = "blue",
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  const t = TONES[tone];
  return (
    <div
      className={cn(
        "mx-auto text-center rounded-2xl border",
        compact ? "max-w-sm px-5 py-7" : "max-w-md px-6 py-10",
        t.panel,
        className
      )}
    >
      <div
        className={cn(
          "mx-auto flex items-center justify-center rounded-2xl",
          compact ? "w-12 h-12 mb-3" : "w-16 h-16 mb-4",
          t.medallion
        )}
      >
        <span className={compact ? "text-2xl" : "text-3xl"} aria-hidden="true">
          {emoji}
        </span>
      </div>
      <p className={cn("font-semibold text-foreground", compact ? "text-sm mb-1" : "text-lg mb-1.5")}>
        {title}
      </p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
