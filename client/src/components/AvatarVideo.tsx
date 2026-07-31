/**
 * AvatarVideo — a looping, muted tutor avatar clip.
 *
 * `autoPlay` only fires when the <video> element is first created, so after a
 * React remount (e.g. returning to the chooser from a session view, or the
 * shared-element morph swapping which avatar is mounted) the clip can come back
 * paused/blank. We explicitly kick off muted playback on mount to guarantee it
 * plays every time.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Cache extracted poster frames per src so we decode each avatar clip only once
// across the whole app, no matter how many message rows render it.
const posterCache = new Map<string, string>();

/**
 * useAvatarPoster — extracts a single still frame from an avatar clip and
 * returns it as a data URL, so many small avatars (e.g. one per transcript line)
 * can render as lightweight <img>s instead of dozens of autoplaying <video>s.
 * Returns null until the frame is ready; callers should fall back to a
 * placeholder in the meantime.
 */
export function useAvatarPoster(src: string | null): string | null {
  const [poster, setPoster] = useState<string | null>(() => (src ? posterCache.get(src) ?? null : null));

  useEffect(() => {
    if (!src) return;
    const cached = posterCache.get(src);
    if (cached) { setPoster(cached); return; }

    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width) return;
        ctx.drawImage(video, 0, 0);
        const url = canvas.toDataURL("image/webp", 0.85);
        posterCache.set(src, url);
        setPoster(url);
      } catch { /* tainted canvas or decode failure — keep placeholder */ }
    };

    const onLoaded = () => { try { video.currentTime = 0.1; } catch { capture(); } };
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", capture);
    video.load();

    return () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("seeked", capture);
    };
  }, [src]);

  return poster;
}

/** Shared framer-motion layout id used to morph a tutor's avatar between the
 *  chooser split-screen and that tutor's idle session screen. Kept here (a
 *  dependency-free module) so every screen references the same id without an
 *  import cycle between the chooser and the session tabs. */
export const avatarLayoutId = (id: "romain" | "anna") => `agent-avatar-${id}`;

export function AvatarVideo({
  src,
  className,
  loop = true,
}: {
  src: string;
  className?: string;
  /** Off for clips that don't loop seamlessly, so they play once and hold on
   *  their final frame instead of jump-cutting back to the start. */
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tryPlay = () => { el.play().catch(() => {}); };
    tryPlay();
    // A play() issued before the media is ready rejects, and with the rejection
    // swallowed there was nothing to retry — the clip would sit frozen on its
    // first frame. Retry once the element reports it can play.
    el.addEventListener("canplay", tryPlay);
    return () => el.removeEventListener("canplay", tryPlay);
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      loop={loop}
      muted
      playsInline
      preload="auto"
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
