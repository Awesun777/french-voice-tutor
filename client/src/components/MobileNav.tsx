/**
 * MobileNav — the phone replacement for the desktop sidebar.
 *
 * A floating white pill bar along the bottom with the five daily tabs
 * (Dashboard, Speaking, Listening, Reading, Flashcards) plus an immersive
 * button that folds the whole bar into a small centered circle; tapping the
 * circle brings the bar back. Admins additionally get a floating top-right
 * toggle that expands into the admin tabs, with the same fold/unfold logic.
 *
 * Deliberately whiter than the app's cream chrome (bg-white, not bg-sidebar):
 * it floats over content of every colour and needs to read as one clean bar.
 */
import { useState } from "react";
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
  { id: "flashcards", label: "Cards", icon: CreditCard },
];

const ADMIN_TABS: { id: SidebarTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "ai", label: "AI Stack", icon: Cpu },
  { id: "ingest", label: "Ingest", icon: UploadCloud },
  { id: "ops", label: "Ops", icon: Activity },
  { id: "testlogs", label: "Test Logs", icon: Clapperboard },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "workflow", label: "Workflow", icon: Workflow },
];

export default function MobileNav({ activeTab, setActiveTab, isAdmin }: MobileNavProps) {
  // Immersive mode: the bar folds into a lone circle so content gets the
  // whole screen (watching a video, reading an article).
  const [collapsed, setCollapsed] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  return (
    <>
      {/* ── Bottom bar / collapsed circle ─────────────────────────────────── */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Show navigation"
          className="fixed left-1/2 -translate-x-1/2 z-40 w-11 h-11 rounded-full bg-white text-muted-foreground shadow-lg border border-black/5 flex items-center justify-center active:scale-95 transition-transform"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <Maximize2 className="w-4.5 h-4.5" />
        </button>
      ) : (
        <nav
          aria-label="Main navigation"
          className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 px-2 py-1.5 rounded-full bg-white shadow-lg border border-black/5"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-2xl transition-colors min-w-[3.25rem]",
                activeTab === id
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground active:bg-black/5"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold leading-none">{label}</span>
            </button>
          ))}
          {/* Immersive: fold the bar away. A hairline separates it from the
              tabs so it doesn't read as a sixth destination. */}
          <span className="w-px h-6 bg-border mx-0.5" aria-hidden />
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Hide navigation"
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground active:bg-black/5 transition-colors"
          >
            <Minimize2 className="w-4.5 h-4.5" />
          </button>
        </nav>
      )}

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
          {adminOpen && (
            <div className="w-44 rounded-2xl bg-white shadow-xl border border-black/5 p-1.5 space-y-0.5">
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
            </div>
          )}
        </div>
      )}
    </>
  );
}
