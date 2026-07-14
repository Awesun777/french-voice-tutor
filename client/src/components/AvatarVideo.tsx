/**
 * AvatarVideo — a looping, muted tutor avatar clip.
 *
 * `autoPlay` only fires when the <video> element is first created, so after a
 * React remount (e.g. returning to the chooser from a session view, or the
 * shared-element morph swapping which avatar is mounted) the clip can come back
 * paused/blank. We explicitly kick off muted playback on mount to guarantee it
 * plays every time.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Shared framer-motion layout id used to morph a tutor's avatar between the
 *  chooser split-screen and that tutor's idle session screen. Kept here (a
 *  dependency-free module) so every screen references the same id without an
 *  import cycle between the chooser and the session tabs. */
export const avatarLayoutId = (id: "romain" | "anna") => `agent-avatar-${id}`;

export function AvatarVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    ref.current?.play().catch(() => {});
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
