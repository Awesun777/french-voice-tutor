/**
 * Shared framer-motion variants for the tutor idle screen.
 *
 * The avatar morphs into place via its shared `layoutId`; the remaining
 * sections (heading, settings, memory, Start button) are staggered in with a
 * gentle fade + rise. `delayChildren` lets the avatar morph start first so the
 * reveal reads as "avatar arrives, then the controls appear."
 */
import type { Variants } from "framer-motion";

export const idleContainer: Variants = {
  hidden: {},
  show: {
    transition: { delayChildren: 0.15, staggerChildren: 0.08 },
  },
};

export const idleItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};
