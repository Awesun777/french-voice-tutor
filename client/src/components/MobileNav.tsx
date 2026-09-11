/**
 * MobileNav — the phone replacement for the desktop sidebar.
 *
 * A floating white pill bar along the bottom with the five daily tabs
 * (Dashboard, Speaking, Listening, Reading, Flashcards) plus an immersive
 * button that folds the whole bar into a small centered circle; tapping the
 * circle brings the bar back. The fold/unfold is a shared-layout morph: the
 * pill and the circle carry the same layoutId, so framer animates one into
 * the other instead of swapping them abruptly. Admins additionally get a
 * floating top-right toggle that expands into the admin tabs.
 *
 * Icon-only by design — five icons plus labels crowded small phones, and the
 * icons are the same ones the desktop sidebar uses, so they're already learnt.
 *
 * Deliberately whiter than the app's cream chrome (bg-white, not bg-sidebar):
 * it floats over content of every colour and needs to read as one clean bar.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTab } from "@/types";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Mic,
  Headphones,
  Newspaper,
  CreditCard,
  Minimize2,
  Maximize2,
  Shield,
  X,
  Cpu,
  UploadCloud,
  Activity,
  Clapperboard,
  Users,
  Workflow,
  ListChecks,
} from "lucide-react";

interface MobileNavProps {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  isAdmin: boolean;
}

const TABS: { id: SidebarTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "voice-chat", label: "Speaking", icon: Mic },
  { id: "listening", label: "Listening", icon: Headphones },
  { id: "reading", label: "Reading", icon: Newspaper },
  { id: "flashcards", label: "Flashcards", icon: CreditCard },
];

const ADMIN_TABS: { id: SidebarTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "ai", label: "AI Stack", icon: Cpu },
  { id: "ingest", label: "Ingest", icon: UploadCloud },
  { id: "ops", label: "Ops", icon: Activity },
  { id: "testlogs", label: "Test Logs", icon: Clapperboard },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "workflow", label: "Workflow", icon: Workflow },
  { id: "tcf", label: "TCF Blanc", icon: ListChecks },
];

const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const;

export default function MobileNav({ activeTab, setActiveTab, isAdmin }: MobileNavProps) {
  // Immersive mode: the bar folds into a lone circle so content gets the
  // whole screen (watching a video, reading an article).
  const [collapsed, setCollapsed] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  return (
    <>
      {/* ── Bottom bar / collapsed circle ──────────────────────────────────
          The wrapper (not the bar) is the fixed element: framer's layout
          morph owns the bar's transform, so centering via -translate-x-1/2
          on the bar itself would be overwritten mid-animation. */}
      <div
        className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {collapsed ? (
            <motion.button
              key="dot"
              layoutId="mobile-nav-shell"
              transition={SPRING}
              style={{ borderRadius: 9999 }}
              onClick={() => setCollapsed(false)}
              aria-label="Show navigation"
              className="pointer-events-auto w-11 h-11 bg-white text-muted-foreground shadow-lg border border-black/5 flex items-center justify-center"
            >
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.1 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                className="flex"
              >
                <Maximize2 className="w-4.5 h-4.5" />
              </motion.span>
            </motion.button>
          ) : (
            <motion.nav
              key="bar"
              layoutId="mobile-nav-shell"
              transition={SPRING}
              style={{ borderRadius: 9999 }}
              aria-label="Main navigation"
              className="pointer-events-auto flex items-center gap-0.5 px-2 py-1.5 bg-white shadow-lg border border-black/5"
            >
              {/* Contents fade as one unit while the shell morphs. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.08 } }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                className="flex items-center gap-0.5"
              >
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    aria-current={activeTab === id ? "page" : undefined}
                    aria-label={label}
                    title={label}
                    className={cn(
                      "flex items-center justify-center w-11 h-11 rounded-full transition-colors",
                      activeTab === id
                        ? "bg-primary/12 text-primary"
                        : "text-muted-foreground active:bg-black/5"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                ))}
                {/* Immersive: fold the bar away. A hairline separates it from
                    the tabs so it doesn't read as a sixth destination. */}
                <span className="w-px h-6 bg-border mx-0.5" aria-hidden />
                <button
                  onClick={() => setCollapsed(true)}
                  aria-label="Hide navigation"
                  className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground active:bg-black/5 transition-colors"
                >
                  <Minimize2 className="w-4.5 h-4.5" />
                </button>
              </motion.div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>

      {/* ── Admin toggle, top-right ───────────────────────────────────────── */}
      {isAdmin && (
        <div
          className="fixed right-3 z-40 flex flex-col items-end gap-2"
          style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button
            onClick={() => setAdminOpen((o) => !o)}
            aria-expanded={adminOpen}
            aria-label={adminOpen ? "Hide admin menu" : "Show admin menu"}
            className={cn(
              "w-10 h-10 rounded-full shadow-lg border border-black/5 flex items-center justify-center active:scale-95 transition-all",
              adminOpen || ADMIN_TABS.some((t) => t.id === activeTab)
                ? "bg-primary text-primary-foreground"
                : "bg-white text-muted-foreground"
            )}
          >
            {adminOpen ? <X className="w-4.5 h-4.5" /> : <Shield className="w-4.5 h-4.5" />}
          </button>
          <AnimatePresence>
            {adminOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="w-44 rounded-2xl bg-white shadow-xl border border-black/5 p-1.5 space-y-0.5 origin-top-right"
              >
                {ADMIN_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id); setAdminOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors",
                      activeTab === id
                        ? "bg-primary/12 text-primary"
                        : "text-muted-foreground active:bg-black/5"
                    )}
                  >
                    <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
