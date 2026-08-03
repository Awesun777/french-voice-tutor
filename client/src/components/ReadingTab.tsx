/**
 * ReadingTab ("Reading").
 *
 * A feed of curated French articles. Opening one takes over the whole pane and
 * renders it like a news page — headline, standfirst, body — with every word and
 * idiom underlined and hoverable for an instant meaning plus a save-to-library
 * button.
 *
 * Independent of the Listening Lab by design: its own feed, its own tables, its
 * own copy of the gloss rendering. The two sections are meant to evolve
 * separately, so nothing here is shared with VideoReader.
 *
 * Glosses ship with the article data, so hovering costs no network request at
 * all — that is the whole point of pre-computing them in
 * scripts/ingest-article.ts.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Check, Plus, Newspaper, ExternalLink, Languages } from "lucide-react";
import { toast } from "sonner";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";

interface Token {
  s: number;
  e: number;
  surface: string;
  lemma?: string | null;
  gloss: string;
  kind: "word" | "expression";
}
interface Block {
  idx: number;
  kind: "heading" | "paragraph";
  text: string;
  tokens: Token[];
  translationEn?: string | null;
}

/** ~200 words per minute is the usual estimate for reading in a second language. */
const WORDS_PER_MINUTE = 200;

function readingMinutes(wordCount: number) {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

function fmtDate(ms: number | null | undefined) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ─── Tab shell ────────────────────────────────────────────────────────────────

export default function ReadingTab() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // Reading an article takes over the whole pane: no header, no feed, just the
  // piece, with the reader's own back button as the way out.
  if (openSlug) {
    return <ArticleReader slug={openSlug} onBack={() => setOpenSlug(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-foreground">Reading</h2>
            <p className="text-sm text-muted-foreground truncate">
              Recent French news and articles, glossed word by word
            </p>
          </div>
        </div>
      </div>
      <ArticleFeed onOpen={setOpenSlug} />
    </div>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

function ArticleFeed({ onOpen }: { onOpen: (slug: string) => void }) {
  const { data: items = [], isLoading } = trpc.articles.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!items.length) return <EmptyReadingState />;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        {items.map((a) => (
          <button
            key={a.slug}
            onClick={() => onOpen(a.slug)}
            className="w-full text-left bg-card rounded-2xl overflow-hidden group flex transition-all duration-200 shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.18)] hover:shadow-[0_10px_28px_-10px_rgb(23_63_107_/_0.30)] hover:-translate-y-0.5"
          >
            {a.imageUrl && (
              <div className="hidden sm:block w-40 flex-shrink-0 bg-muted overflow-hidden">
                <img
                  src={a.imageUrl}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                />
              </div>
            )}
            <div className="flex-1 min-w-0 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-speaking">
                {a.source && <span className="truncate">{a.source}</span>}
                {a.level && (
                  <span className="px-1.5 py-0.5 rounded bg-speaking-surface text-speaking">{a.level}</span>
                )}
              </div>
              <p className="font-display text-base font-bold text-foreground mt-1 line-clamp-2">
                {a.title}
              </p>
              {a.summary && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
              )}
              <p className="text-xs text-muted-foreground/80 mt-2">
                {readingMinutes(a.wordCount)} min read · {a.wordCount} words
                {fmtDate(a.publishedAt) ? ` · ${fmtDate(a.publishedAt)}` : ""}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyReadingState() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-speaking-surface flex items-center justify-center mx-auto">
          <Newspaper className="w-7 h-7 text-speaking" />
        </div>
        <p className="font-display text-lg font-bold text-foreground mt-4">No articles yet</p>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Articles are curated ahead of time so every word is already glossed. Add one with{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted text-xs">
            pnpm tsx scripts/ingest-article.ts &lt;url&gt;
          </code>
        </p>
      </div>
    </div>
  );
}

// ─── Reader ───────────────────────────────────────────────────────────────────

/** Roughly the hover card's height; used only to decide which side to open on. */
const HOVER_CARD_H = 170;

function ArticleReader({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data, isLoading } = trpc.articles.get.useQuery({ slug });
  const utils = trpc.useUtils();
  const { speak, state: pronounceState, activeText } = usePronounce();

  const blocks: Block[] = useMemo(() => (data?.blocks ?? []) as Block[], [data]);

  // ─── Hover gloss ───────────────────────────────────────────────────────────
  // One shared card positioned from the hovered span's rect, rather than a
  // popover root per token — an article runs to hundreds of tokens.
  // English stays hidden by default: the point of the reader is to work out the
  // French first, and a translation under every paragraph removes the work.
  const [showEnglish, setShowEnglish] = useState(false);
  const [hover, setHover] = useState<{ token: Token; top: number; left: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);
  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverTimer.current = window.setTimeout(() => setHover(null), 160);
  }, [cancelHoverClose]);
  useEffect(() => cancelHoverClose, [cancelHoverClose]);

  const openHover = useCallback(
    (token: Token, el: HTMLElement) => {
      cancelHoverClose();
      const r = el.getBoundingClientRect();
      // Flip above the word when there isn't room below, otherwise the card is
      // clipped by the viewport for anything low in the article.
      const below = r.bottom + 8;
      const flip = below + HOVER_CARD_H > window.innerHeight;
      setHover({
        token,
        top: flip ? Math.max(8, r.top - HOVER_CARD_H - 8) : below,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
      });
      // Deliberately no TTS preload here. Glosses ship with the article, so
      // hovering must cost zero requests — warming audio on hover would fire a
      // synthesis call for every word skimmed, and there is no rate limiting
      // anywhere. Audio is fetched when the pronounce button is pressed.
    },
    [cancelHoverClose]
  );

  // ─── Saving ────────────────────────────────────────────────────────────────
  const addVocab = trpc.vocab.add.useMutation();
  const { data: allVocab = [] } = trpc.vocab.list.useQuery();
  const savedHere = useMemo(
    () => allVocab.filter((w) => w.lessonSource && w.lessonSource === data?.article.title),
    [allVocab, data?.article.title]
  );
  const saved = useMemo(
    () => new Set(savedHere.map((w) => w.term.toLowerCase())),
    [savedHere]
  );

  const save = async (token: Token) => {
    const key = token.surface.toLowerCase();
    if (saved.has(key)) return;
    try {
      await addVocab.mutateAsync({
        term: token.surface,
        translation: token.gloss || token.surface,
        // Same ≥3-words rule the dictionary uses.
        entryKind: token.surface.trim().split(/\s+/).length >= 3 ? "phrase" : "word",
        lessonSource: data?.article.title ?? "Article",
      });
      utils.vocab.list.invalidate();
      toast.success(`Saved "${token.surface}"`);
    } catch {
      toast.error("Failed to save");
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const article = data?.article;
  const isSaved = hover ? saved.has(hover.token.surface.toLowerCase()) : false;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Back bar. The reader takes over the whole pane — the Reading header and
          feed are hidden while an article is open — so this owns the way back. */}
      <div className="flex-shrink-0 bg-background relative z-10 shadow-[0_10px_24px_-18px_rgb(23_63_107_/_0.55)]">
        <div className="mx-auto w-full max-w-3xl flex items-center gap-3 px-4 py-2.5">
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Articles
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 relative">
          <div className="h-full overflow-y-auto px-4 py-6">
            <article className="max-w-2xl mx-auto pb-32">
              {/* Masthead */}
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-speaking">
                {article?.source && <span>{article.source}</span>}
                {article?.level && (
                  <span className="px-1.5 py-0.5 rounded bg-speaking-surface">{article.level}</span>
                )}
              </div>
              <h1 className="font-display text-3xl font-bold text-foreground leading-tight mt-2">
                {article?.title}
              </h1>
              {article?.summary && (
                <p className="text-lg text-muted-foreground leading-relaxed mt-3">{article.summary}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground/80 mt-3 pb-5 border-b border-border/60">
                <span>{readingMinutes(article?.wordCount ?? 0)} min read</span>
                {fmtDate(article?.publishedAt) && <span>{fmtDate(article?.publishedAt)}</span>}
                {article?.url && (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Original <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => setShowEnglish((v) => !v)}
                  aria-pressed={showEnglish}
                  className={cn(
                    "ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-colors",
                    showEnglish
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <Languages className="w-3.5 h-3.5" /> English
                </button>
              </div>

              {article?.imageUrl && (
                <img
                  src={article.imageUrl}
                  alt=""
                  className="w-full rounded-2xl mt-6 shadow-[0_10px_28px_-14px_rgb(23_63_107_/_0.4)]"
                />
              )}

              {/* Body */}
              <div className="mt-6 space-y-5">
                {blocks.map((block) =>
                  block.kind === "heading" ? (
                    <h2
                      key={block.idx}
                      className="font-display text-xl font-bold text-foreground leading-snug pt-2"
                    >
                      <BlockText block={block} onHover={openHover} onLeave={scheduleHoverClose} />
                    </h2>
                  ) : (
                    <p
                      key={block.idx}
                      // Generous measure and leading: this should read like a
                      // news page, not a transcript.
                      className="text-[1.0625rem] leading-[1.85] text-foreground"
                    >
                      <BlockText block={block} onHover={openHover} onLeave={scheduleHoverClose} />
                      {showEnglish && block.translationEn && (
                        <span className="block mt-1.5 text-base leading-relaxed text-muted-foreground/80 italic">
                          {block.translationEn}
                        </span>
                      )}
                    </p>
                  )
                )}
              </div>
            </article>
          </div>

          {hover && (
            <div
              style={{ top: hover.top, left: hover.left }}
              onMouseEnter={cancelHoverClose}
              onMouseLeave={scheduleHoverClose}
              className="fixed z-50 w-64 rounded-2xl bg-popover p-3 shadow-[0_12px_32px_-8px_rgb(23_63_107_/_0.35)] ring-1 ring-black/5"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground break-words">{hover.token.surface}</p>
                  {hover.token.lemma && (
                    <p className="text-xs text-muted-foreground italic">{hover.token.lemma}</p>
                  )}
                </div>
                <PronounceButton
                  text={hover.token.surface}
                  speak={speak}
                  state={pronounceState}
                  activeText={activeText}
                  className="p-1.5 bg-primary/15 hover:bg-primary/25 text-primary flex-shrink-0"
                  iconSize="w-3.5 h-3.5"
                />
              </div>
              <p className="text-sm text-foreground mt-1.5">
                {hover.token.gloss || <span className="text-muted-foreground italic">no gloss</span>}
              </p>
              <button
                onClick={() => save(hover.token)}
                disabled={isSaved}
                className={cn(
                  "mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  isSaved
                    ? "bg-emerald-500/15 text-emerald-700"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                )}
              >
                {isSaved
                  ? <><Check className="w-3.5 h-3.5" /> Saved</>
                  : <><Plus className="w-3.5 h-3.5" /> Save to library</>}
              </button>
            </div>
          )}
        </div>

        {/* Saved-words rail. Reads from the library filtered by this article, so
            it survives leaving and coming back rather than only showing this
            session's saves. */}
        <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-background">
          <div className="px-4 pt-6 pb-2">
            <p className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Saved from this article
            </p>
          </div>
          {savedHere.length === 0 ? (
            <p className="px-4 text-xs text-muted-foreground/80 leading-relaxed">
              Hover any underlined word for its meaning, then save it — it will collect here.
            </p>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-1">
              {savedHere.map((w) => (
                <div key={w.id} className="rounded-xl px-2.5 py-2 hover:bg-muted/40 transition-colors">
                  <p className="text-sm font-semibold text-foreground break-words">{w.term}</p>
                  <p className="text-xs text-muted-foreground break-words">{w.translation}</p>
                </div>
              ))}
            </div>
          )}
          {savedHere.length > 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {savedHere.length} word{savedHere.length === 1 ? "" : "s"} saved
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Block rendering ──────────────────────────────────────────────────────────

/**
 * Renders a block with each token underlined so the segmentation is visible.
 * An expression is a single span across all its words, so "au cours de" reads
 * as one unit with one continuous underline rather than three.
 */
function BlockText({
  block,
  onHover,
  onLeave,
}: {
  block: Block;
  onHover: (t: Token, el: HTMLElement) => void;
  onLeave: () => void;
}) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  block.tokens.forEach((t) => {
    if (t.s > at) parts.push(<span key={`gap-${at}`}>{block.text.slice(at, t.s)}</span>);
    parts.push(
      <span
        key={`tok-${t.s}`}
        onMouseEnter={(e) => onHover(t, e.currentTarget)}
        onMouseLeave={onLeave}
        className={cn(
          "cursor-help transition-colors",
          t.kind === "expression"
            ? "border-b-2 border-dashed border-speaking/60 hover:bg-speaking-surface"
            : "border-b border-dashed border-muted-foreground/40 hover:bg-primary/10"
        )}
      >
        {block.text.slice(t.s, t.e)}
      </span>
    );
    at = t.e;
  });
  if (at < block.text.length) parts.push(<span key="tail">{block.text.slice(at)}</span>);
  return <>{parts}</>;
}
