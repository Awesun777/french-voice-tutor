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
import { Loader2, ArrowLeft, Check, Plus, Crosshair } from "lucide-react";
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
interface Cue { idx: number; startMs: number; endMs: number; text: string; tokens: Token[] }

// ─── YouTube IFrame API ───────────────────────────────────────────────────────

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayer {
  getCurrentTime(): number;
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
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
        {videos.map((v) => (
          <button
            key={v.youtubeId}
            onClick={() => onOpen(v.youtubeId)}
            className="text-left bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 transition-colors group"
          >
            <div className="aspect-video bg-muted overflow-hidden">
              {v.thumbnailUrl && (
                <img
                  src={v.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                />
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-foreground line-clamp-2">{v.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {v.channel ? `${v.channel} · ` : ""}{fmtDuration(v.durationSec)}
                {v.level ? ` · ${v.level}` : ""}
              </p>
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
  const [hover, setHover] = useState<{ token: Token; top: number; left: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  const cancelHoverClose = () => {
    if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  };
  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverTimer.current = window.setTimeout(() => setHover(null), 160);
  };
  useEffect(() => cancelHoverClose, []);

  /** Roughly the card's height; used only to decide which side to open on. */
  const HOVER_CARD_H = 170;

  const openHover = (token: Token, el: HTMLElement) => {
    cancelHoverClose();
    const r = el.getBoundingClientRect();
    // Flip above the word when there isn't room below, otherwise the card is
    // clipped by the viewport for anything in the lower part of the transcript.
    const below = r.bottom + 8;
    const flip = below + HOVER_CARD_H > window.innerHeight;
    setHover({
      token,
      top: flip ? Math.max(8, r.top - HOVER_CARD_H - 8) : below,
      left: Math.max(8, Math.min(r.left, window.innerWidth - 280)),
    });
    // Deliberately no TTS preload here. Glosses ship with the cue, so hovering
    // must cost zero requests — warming audio on hover would fire a synthesis
    // call for every word skimmed, and there is no rate limiting anywhere.
    // Audio is fetched on demand when the pronounce button is actually pressed.
  };

  const addVocab = trpc.vocab.add.useMutation();
  const [saved, setSaved] = useState<Set<string>>(new Set());

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
      setSaved((s) => new Set(s).add(key));
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
      <div className="flex-shrink-0 border-b border-border bg-background">
        <div className="mx-auto w-full max-w-2xl flex items-center gap-3 px-1 py-2.5">
          <button
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Videos
          </button>
          <p className="text-sm font-semibold text-foreground truncate">{data?.lesson.title}</p>
        </div>
        <div className="mx-auto w-full max-w-2xl aspect-video bg-foreground/90 rounded-xl overflow-hidden">
          <YouTubePlayer videoId={youtubeId} onPlayer={handlePlayer} onState={handleState} />
        </div>
        <div className="h-3" />
      </div>

      {/* Transcript */}
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
          <div className="max-w-2xl mx-auto space-y-2 pb-32">
            {cues.map((cue, i) => (
              <p
                key={cue.idx}
                ref={(el) => { cueRefs.current[i] = el; }}
                onClick={() => playerRef.current?.seekTo(cue.startMs / 1000, true)}
                className={cn(
                  "text-base leading-loose rounded-xl px-3 py-2 cursor-pointer transition-colors",
                  i === activeIdx
                    ? "bg-secondary/70 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40"
                )}
              >
                <CueText
                  cue={cue}
                  isActive={i === activeIdx}
                  timeMs={timeMs}
                  onHover={openHover}
                  onLeave={scheduleHoverClose}
                />
              </p>
            ))}
          </div>
        </div>

        {hover && (
          <div
            style={{ top: hover.top, left: hover.left }}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={scheduleHoverClose}
            className="fixed z-50 w-64 rounded-2xl border border-border bg-popover shadow-xl p-3"
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
