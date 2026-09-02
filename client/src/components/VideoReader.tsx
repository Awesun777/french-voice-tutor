/**
 * VideoReader — curated YouTube lessons with a timed, glossed transcript.
 *
 * Player on top, scrollable transcript below. The spoken line is highlighted
 * and scrolled into view, and every word or idiom is hoverable for an instant
 * meaning. Glosses ship with the cue data, so hovering costs no network
 * request at all — that is the whole point of pre-computing them in
 * scripts/ingest-video.ts.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, Check, Plus, Crosshair, Languages } from "lucide-react";
import { toast } from "sonner";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";
import { EmptyVideoState } from "@/components/VideoReaderEmpty";

interface Token {
  s: number;
  e: number;
  surface: string;
  lemma?: string | null;
  gloss: string;
  kind: "word" | "expression";
  tMs?: number | null;
}
interface Cue { idx: number; startMs: number; endMs: number; text: string; tokens: Token[]; translationEn?: string | null }

// ─── YouTube IFrame API ───────────────────────────────────────────────────────

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayer {
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(sec: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

/**
 * Idempotent, unlike the loader in Map.tsx — the IFrame API installs a single
 * global and must be injected exactly once no matter how many readers mount.
 */
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return ytApiPromise;
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoFeed({ onOpen }: { onOpen: (youtubeId: string) => void }) {
  const { data: videos = [], isLoading } = trpc.videos.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!videos.length) return <EmptyVideoState />;

  return (
    // YouTube-style feed: full pane width, bare rounded thumbnails with a
    // duration pill, and the meta row below the image instead of a card box —
    // the grid reads as content, not chrome.
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-7">
        {videos.map((v) => (
          <button
            key={v.youtubeId}
            onClick={() => onOpen(v.youtubeId)}
            // flex-col defeats the button's native vertical centering: the grid
            // stretches every card in a row to the same height, and a centered
            // short card would sag its thumbnail out of line with its neighbors.
            className="text-left group flex flex-col items-stretch"
          >
            <div className="relative aspect-video bg-muted overflow-hidden rounded-xl">
              {v.thumbnailUrl && (
                <img
                  src={v.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                />
              )}
              <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/85 text-white text-[13px] font-bold leading-none tabular-nums">
                {fmtDuration(v.durationSec)}
              </span>
            </div>
            <div className="mt-2.5 flex gap-3">
              {/* The channel's real avatar when the ingest captured one; the
                  initial stays underneath as the fallback if it's missing or
                  the image 404s. */}
              <div className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                {(v.channel || "R").charAt(0).toUpperCase()}
                {v.channelAvatarUrl && (
                  <img
                    src={v.channelAvatarUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => e.currentTarget.remove()}
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {v.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <span className="truncate">{v.channel || "RomainTube"}</span>
                  {v.level && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                      {v.level}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The player lives in its own component so its host div is guaranteed to exist
 * when the effect runs. Previously the effect sat in the reader alongside an
 * `if (isLoading) return <Loader/>` guard, so on any load where the IFrame API
 * was already cached the promise resolved before the transcript query did — the
 * host ref was still null, the effect bailed, and no player was ever created.
 */
function YouTubePlayer({
  videoId,
  onPlayer,
  onState,
}: {
  videoId: string;
  onPlayer: (p: YTPlayer | null) => void;
  onState: (state: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT) return;
      player = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => { if (!cancelled) onPlayer(player); },
          onStateChange: (e: { data: number }) => { if (!cancelled) onState(e.data); },
        },
      });
    });

    return () => {
      cancelled = true;
      onPlayer(null);
      try { player?.destroy(); } catch { /* already gone */ }
    };
  }, [videoId, onPlayer, onState]);

  return <div ref={hostRef} className="w-full h-full" />;
}

// ─── Reader ───────────────────────────────────────────────────────────────────

export function VideoReader({ youtubeId, onBack }: { youtubeId: string; onBack: () => void }) {
  const { data, isLoading } = trpc.videos.get.useQuery({ youtubeId });
  const utils = trpc.useUtils();
  const { speak, state: pronounceState, activeText } = usePronounce();

  const playerRef = useRef<YTPlayer | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cueRefs = useRef<Record<number, HTMLParagraphElement | null>>({});

  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  /** Autoscroll follows playback until the reader scrolls by hand. */
  const [following, setFollowing] = useState(true);
  // English stays hidden by default: the point of the reader is to work out the
  // French first, and a translation sitting under every line removes the work.
  const [showEnglish, setShowEnglish] = useState(false);
  const programmaticScroll = useRef(false);

  const cues: Cue[] = useMemo(() => (data?.cues ?? []) as Cue[], [data]);

  const handlePlayer = useCallback((p: YTPlayer | null) => {
    playerRef.current = p;
    setPlayerReady(!!p);
  }, []);

  const handleState = useCallback((state: number) => {
    setPlaying(state === window.YT?.PlayerState.PLAYING);
    // A seek re-engages following: you jumped somewhere deliberately, so the
    // transcript should go there too.
    if (state === window.YT?.PlayerState.BUFFERING) setFollowing(true);
  }, []);

  // Transport keys, matching YouTube's own: space toggles play, left/right seek
  // by 5s. preventDefault stops space and the arrows from also scrolling the
  // transcript, which is their default action on a scrollable pane. Typing
  // fields are skipped — the dictionary drawer can be opened over this page.
  useEffect(() => {
    if (!playerReady) return;
    const SEEK_SEC = 5;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const p = playerRef.current;
      if (!p) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        // 1 === PLAYING in the IFrame API's PlayerState enum.
        if (p.getPlayerState() === 1) p.pauseVideo();
        else p.playVideo();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? SEEK_SEC : -SEEK_SEC;
        p.seekTo(Math.max(0, p.getCurrentTime() + delta), true);
        // Seeking is deliberate navigation, so re-engage autoscroll.
        setFollowing(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerReady]);

  // Poll the clock once a player exists. 250ms is plenty for line-level
  // tracking — the highlight needs to look responsive, not be frame-accurate.
  useEffect(() => {
    if (!playerReady) return;
    const poll = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setTimeMs(Math.round(p.getCurrentTime() * 1000));
    }, 250);
    return () => window.clearInterval(poll);
  }, [playerReady]);

  // ─── Active cue (binary search over a sorted, non-overlapping list) ────────
  const activeIdx = useMemo(() => {
    let lo = 0, hi = cues.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = cues[mid];
      if (timeMs < c.startMs) hi = mid - 1;
      else if (timeMs > c.endMs) lo = mid + 1;
      else { found = mid; break; }
    }
    // Between cues: keep the previous line lit rather than flickering to none.
    if (found === -1 && hi >= 0) found = hi;
    return found;
  }, [cues, timeMs]);

  // ─── Autoscroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!following || !playing || activeIdx < 0) return;
    const el = cueRefs.current[activeIdx];
    const scroller = scrollRef.current;
    if (!el || !scroller) return;

    // Offsets from bounding rects, and scrollTop assigned directly:
    // scrollIntoView({behavior:"smooth"}) is silently dropped in some
    // environments, which would leave the transcript stuck.
    const target =
      scroller.scrollTop +
      (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) -
      scroller.clientHeight * 0.35;
    if (Math.abs(target - scroller.scrollTop) < 8) return;
    programmaticScroll.current = true;
    scroller.scrollTop = target;
    // Cleared on the next frame so the scroll event it causes isn't mistaken
    // for the reader scrolling by hand.
    requestAnimationFrame(() => { programmaticScroll.current = false; });
  }, [activeIdx, following, playing]);

  const onScroll = useCallback(() => {
    if (programmaticScroll.current) return;
    setFollowing(false);
  }, []);

  // ─── Hover gloss ───────────────────────────────────────────────────────────
  // One shared card positioned from the hovered span's rect, rather than a
  // popover root per token — a transcript runs to hundreds of tokens.
  // Anchored by `bottom` when flipped above the word, so the card's lower edge
  // hugs the word regardless of the card's real height — an estimated-height
  // `top` left a dead gap under short glosses, and crossing that gap swept the
  // cursor over the line above, whose tokens stole the card before the pointer
  // could reach the save button.
  const [hover, setHover] = useState<{ token: Token; top?: number; bottom?: number; left: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const pendingOpen = useRef<number | null>(null);

  const cancelHoverClose = () => {
    if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  };
  const cancelPendingOpen = () => {
    if (pendingOpen.current !== null) { window.clearTimeout(pendingOpen.current); pendingOpen.current = null; }
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverTimer.current = window.setTimeout(() => setHover(null), 160);
  };
  useEffect(() => () => { cancelHoverClose(); cancelPendingOpen(); }, []);

  /** Rough card height — used only to pick which side to open on. */
  const HOVER_CARD_H = 170;

  const openHover = (token: Token, el: HTMLElement) => {
    cancelHoverClose();
    cancelPendingOpen();
    const commit = () => {
      const r = el.getBoundingClientRect();
      const below = r.bottom + 6;
      const flip = below + HOVER_CARD_H > window.innerHeight;
      setHover(
        flip
          ? { token, bottom: window.innerHeight - r.top + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) }
          : { token, top: below, left: Math.max(8, Math.min(r.left, window.innerWidth - 280)) }
      );
    };
    // Hover intent: with a card already up, brushing other tokens on the way
    // to it must not replace it — only a deliberate pause on a word does.
    if (hover) pendingOpen.current = window.setTimeout(commit, 130);
    else commit();
    // Deliberately no TTS preload here. Glosses ship with the cue, so hovering
    // must cost zero requests — warming audio on hover would fire a synthesis
    // call for every word skimmed, and there is no rate limiting anywhere.
    // Audio is fetched on demand when the pronounce button is actually pressed.
  };

  const addVocab = trpc.vocab.add.useMutation();
  const { data: allVocab = [] } = trpc.vocab.list.useQuery();
  const savedHere = useMemo(
    () => allVocab.filter((w) => w.lessonSource && w.lessonSource === data?.lesson.title),
    [allVocab, data?.lesson.title]
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
        lessonSource: data?.lesson.title ?? "Video",
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Player. The reader takes over the whole pane — the Listening Lab header
          and mode switcher are hidden while a video is open — so this bar owns
          the only way back. */}
      <div className="flex-shrink-0 bg-primary relative z-10 shadow-[0_12px_28px_-14px_rgb(23_63_107_/_0.65)]">
        <div className="mx-auto w-full max-w-5xl flex items-center gap-3 px-1 py-2.5">
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-lg text-xs font-semibold text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Videos
          </button>
          <p className="text-sm font-semibold text-primary-foreground/90 truncate">{data?.lesson.title}</p>
          <button
            onClick={() => setShowEnglish((v) => !v)}
            aria-pressed={showEnglish}
            title={showEnglish ? "Hide English" : "Show English"}
            className={cn(
              "ml-auto flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              showEnglish
                ? "bg-white/20 text-primary-foreground"
                : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
            )}
          >
            <Languages className="w-4 h-4" /> English
          </button>
        </div>
        <div className="mx-auto w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_18px_44px_-14px_rgb(0_0_0_/_0.55)]">
          <YouTubePlayer videoId={youtubeId} onPlayer={handlePlayer} onState={handleState} />
        </div>
        <div className="h-3" />
      </div>

      {/* Transcript + saved-words rail */}
      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-h-0 relative">
        {!following && (
          <button
            onClick={() => setFollowing(true)}
            className="absolute z-10 right-4 top-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary/90 transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" /> Follow along
          </button>
        )}
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4">
          {/* Same column width as the player, flush left edges: the accent
              bar (the transcript's visible left edge) lines up with the
              video's left edge. */}
          <div className="max-w-5xl mx-auto space-y-0.5 pb-32">
            {cues.map((cue, i) => (
              <p
                key={cue.idx}
                ref={(el) => { cueRefs.current[i] = el; }}
                onClick={() => playerRef.current?.seekTo(cue.startMs / 1000, true)}
                className={cn(
                  // Tight gap, generous line-height: reads as prose rather than
                  // a spaced-out list. The accent bar is on every line as
                  // transparent, so becoming active doesn't shift the text.
                  "border-l-[3px] pl-4 pr-3 py-1.5 rounded-r-lg leading-8 cursor-pointer transition-all",
                  i === activeIdx
                    ? "border-primary bg-secondary/60 text-foreground text-[1.0625rem]"
                    : i < activeIdx
                      // Already spoken — dimmed, so the transcript carries a
                      // sense of where you are rather than looking uniform.
                      ? "border-transparent text-muted-foreground/55 hover:bg-muted/30"
                      : "border-transparent text-muted-foreground hover:bg-muted/30"
                )}
              >
                <CueText
                  cue={cue}
                  isActive={i === activeIdx}
                  timeMs={timeMs}
                  onHover={openHover}
                  onLeave={scheduleHoverClose}
                />
                {showEnglish && cue.translationEn && (
                  <span className="block mt-0.5 text-sm leading-6 text-muted-foreground/80 italic">
                    {cue.translationEn}
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>

        {hover && (
          <div
            style={{ top: hover.top, bottom: hover.bottom, left: hover.left }}
            onMouseEnter={() => { cancelHoverClose(); cancelPendingOpen(); }}
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
              disabled={saved.has(hover.token.surface.toLowerCase())}
              className={cn(
                "mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                saved.has(hover.token.surface.toLowerCase())
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              )}
            >
              {saved.has(hover.token.surface.toLowerCase())
                ? <><Check className="w-3.5 h-3.5" /> Saved</>
                : <><Plus className="w-3.5 h-3.5" /> Save to library</>}
            </button>
          </div>
        )}
      </div>

      {/* Saved-words rail. Reads from the library filtered by this lesson, so it
          survives leaving and coming back rather than only showing this
          session's saves. */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-background">
        <div className="px-4 pt-5 pb-2">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Saved from this video
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

// ─── Cue rendering ────────────────────────────────────────────────────────────

/**
 * Renders a cue with each token underlined so the segmentation is visible.
 * An expression is a single span across all its words, so "pour être honnête"
 * reads as one unit with one continuous underline rather than three.
 */
function CueText({
  cue,
  isActive,
  timeMs,
  onHover,
  onLeave,
}: {
  cue: Cue;
  isActive: boolean;
  timeMs: number;
  onHover: (t: Token, el: HTMLElement) => void;
  onLeave: () => void;
}) {
  // The word currently being spoken: the last token whose start time has passed.
  const spokenIdx = useMemo(() => {
    if (!isActive) return -1;
    let found = -1;
    cue.tokens.forEach((t, i) => {
      if (typeof t.tMs === "number" && t.tMs <= timeMs) found = i;
    });
    return found;
  }, [cue.tokens, isActive, timeMs]);

  const parts: React.ReactNode[] = [];
  let at = 0;
  cue.tokens.forEach((t, i) => {
    if (t.s > at) parts.push(<span key={`gap-${at}`}>{cue.text.slice(at, t.s)}</span>);
    parts.push(
      <span
        key={`tok-${t.s}`}
        onMouseEnter={(e) => onHover(t, e.currentTarget)}
        onMouseLeave={onLeave}
        className={cn(
          "cursor-help transition-colors",
          t.kind === "expression"
            ? "border-b-2 border-dashed border-speaking/60 hover:bg-speaking-surface"
            : "border-b border-dashed border-muted-foreground/40 hover:bg-primary/10",
          isActive && i === spokenIdx && "bg-primary/20 rounded"
        )}
      >
        {cue.text.slice(t.s, t.e)}
      </span>
    );
    at = t.e;
  });
  if (at < cue.text.length) parts.push(<span key="tail">{cue.text.slice(at)}</span>);
  return <>{parts}</>;
}
