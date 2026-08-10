import { useState, useEffect, useRef } from "react";
import { SidebarTab } from "@/types";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Clapperboard,
  Activity,
  BookOpen,
  BookMarked,
  LayoutDashboard,
  Brain,
  CreditCard,
  MessageCircle,
  Mic,
  BarChart3,
  GraduationCap,
  Headphones,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Layers,
  ClipboardCheck,
  LogOut,
  Settings,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/SettingsTab";

interface SidebarProps {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  user: { name?: string | null; email?: string | null; role?: string | null };
}

interface NavLeaf {
  kind: "leaf";
  id: SidebarTab;
  label: string;
  icon: React.ReactNode;
}
interface NavGroup {
  kind: "group";
  id: string;
  label: string;
  icon: React.ReactNode;
  items: Omit<NavLeaf, "kind">[];
}
/** A hairline separating the main flow from the reference tools below it. */
interface NavDivider {
  kind: "divider";
  id: string;
}
type NavEntry = NavLeaf | NavGroup | NavDivider;

const ICON = "w-4.5 h-4.5";

/**
 * Ordered by how the app is meant to be used, not by how old each feature is.
 * Dashboard, then the two ways of learning; Dictionary and Tutor Chat are
 * reference tools you reach for mid-task — and both already have a keyboard
 * shortcut — so they sit below the divider rather than competing at the top.
 */
const NAV: NavEntry[] = [
  { kind: "leaf", id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className={ICON} /> },
  { kind: "leaf", id: "voice-chat", label: "Voice Chat", icon: <Mic className={ICON} /> },
  {
    kind: "group",
    id: "vocab-review",
    label: "Vocab Review",
    icon: <Layers className={ICON} />,
    items: [
      { id: "library", label: "My Library", icon: <BookMarked className={ICON} /> },
      { id: "quiz", label: "Quiz", icon: <Brain className={ICON} /> },
      { id: "flashcards", label: "Flashcards", icon: <CreditCard className={ICON} /> },
      { id: "progress", label: "Progress", icon: <BarChart3 className={ICON} /> },
    ],
  },
  {
    kind: "group",
    id: "test-prep",
    label: "Test Prep",
    icon: <ClipboardCheck className={ICON} />,
    items: [
      { id: "listening", label: "RomainTube", icon: <Headphones className={ICON} /> },
      { id: "reading", label: "Reading", icon: <Newspaper className={ICON} /> },
      { id: "grammar", label: "Grammar Test", icon: <GraduationCap className={ICON} /> },
    ],
  },
  { kind: "divider", id: "tools" },
  { kind: "leaf", id: "dictionary", label: "Dictionary", icon: <BookOpen className={ICON} /> },
  { kind: "leaf", id: "tutor", label: "Tutor Chat", icon: <MessageCircle className={ICON} /> },
  { kind: "leaf", id: "settings", label: "Settings", icon: <Settings className={ICON} /> },
];

export default function Sidebar({ activeTab, setActiveTab, open, setOpen, user }: SidebarProps) {
  // Admin-only entries appended at render time — NAV itself stays static.
  const nav: NavEntry[] = user.role === "admin"
    ? [...NAV,
       { kind: "leaf", id: "ingest", label: "Ingest", icon: <UploadCloud className={ICON} /> },
       { kind: "leaf", id: "ops", label: "Ops", icon: <Activity className={ICON} /> },
       { kind: "leaf", id: "testlogs", label: "Test Logs", icon: <Clapperboard className={ICON} /> }]
    : NAV;
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.reload(); },
    onError: () => toast.error("Logout failed"),
  });

  // Google avatar, stored at sign-in. Null for non-Google sign-ins, which the
  // Avatar component renders as an initial.
  const { data: profile } = trpc.auth.profile.useQuery();
  const avatar = profile?.picture ?? null;

  // ─── Group flyout ───────────────────────────────────────────────────────────
  // Groups open a floating panel to the right on hover rather than expanding in
  // place. Positioned `fixed` from the trigger's rect: the nav scrolls, and an
  // absolutely-positioned child would be clipped by its overflow.
  const [flyout, setFlyout] = useState<{ id: string; top: number; left: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // A grace period so the pointer can travel diagonally from the row to the
  // panel without crossing a dead gap and dismissing it.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setFlyout(null), 180);
  };
  useEffect(() => cancelClose, []);

  const openFlyout = (id: string, el: HTMLElement, itemCount: number) => {
    cancelClose();
    const r = el.getBoundingClientRect();
    // Keep the panel on screen when the trigger sits low in the viewport.
    const estimatedHeight = itemCount * 40 + 40;
    setFlyout({
      id,
      top: Math.max(8, Math.min(r.top, window.innerHeight - estimatedHeight - 8)),
      left: r.right + 8,
    });
  };

  useEffect(() => {
    if (!flyout) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFlyout(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyout]);

  const flyoutGroup = flyout
    ? (NAV.find((e): e is NavGroup => e.kind === "group" && e.id === flyout.id) ?? null)
    : null;

  const renderLeaf = (item: Omit<NavLeaf, "kind">, inFlyout: boolean) => (
    <button
      key={item.id}
      role={inFlyout ? "menuitem" : undefined}
      onClick={() => { setActiveTab(item.id); setFlyout(null); }}
      className={cn(
        "w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        !open && !inFlyout && "justify-center px-2",
        activeTab === item.id
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
      title={!open && !inFlyout ? item.label : undefined}
    >
      <span className={cn("flex-shrink-0", activeTab === item.id ? "text-primary" : "")}>
        {item.icon}
      </span>
      {(open || inFlyout) && <span className="truncate">{item.label}</span>}
    </button>
  );

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex-shrink-0",
        open ? "w-56" : "w-14"
      )}
    >
      {/* Header — the whole bar is the collapse toggle, so it's an easy target.
          The chevron is decorative markup rather than a nested button, which
          isn't valid inside a button and would swallow its own clicks. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        title={open ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(
          "group w-full flex items-center h-14 px-3 border-b border-sidebar-border gap-2.5 flex-shrink-0 text-left hover:bg-sidebar-accent/60 transition-colors",
          !open && "justify-center"
        )}
      >
        {/* The wordmark carries the brand name, so alt text is the app name.
            Collapsed the rail is w-14 — 32px of usable width — which the toggle
            already needs, so the logo is dropped rather than clipped. */}
        {open && (
          <span className="flex-1 min-w-0">
            <img
              src="/brand/romaintalk-wordmark.png"
              alt="RomainTalk"
              className="h-8 w-auto max-w-full object-contain object-left"
            />
          </span>
        )}
        <span className="p-1 rounded-md text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">
          {open ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {nav.map((entry) => {
          if (entry.kind === "divider") {
            return (
              <div key={entry.id} className="pt-2 mt-2 border-t border-sidebar-border" aria-hidden />
            );
          }
          if (entry.kind === "leaf") return renderLeaf(entry, false);
          const isOpen = flyout?.id === entry.id;
          // Children never render inline, so the row itself has to show when the
          // current tab lives inside it.
          const holdsActive = entry.items.some((i) => i.id === activeTab);
          return (
            <button
              key={entry.id}
              onMouseEnter={(e) => openFlyout(entry.id, e.currentTarget, entry.items.length)}
              onMouseLeave={scheduleClose}
              onFocus={(e) => openFlyout(entry.id, e.currentTarget, entry.items.length)}
              onClick={(e) =>
                isOpen ? setFlyout(null) : openFlyout(entry.id, e.currentTarget, entry.items.length)
              }
              aria-haspopup="menu"
              aria-expanded={isOpen}
              title={!open ? entry.label : undefined}
              className={cn(
                "relative w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                !open && "justify-center px-2",
                isOpen || holdsActive
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <span className={cn("flex-shrink-0", holdsActive && "text-primary")}>{entry.icon}</span>
              {open && <span className="flex-1 text-left truncate">{entry.label}</span>}
              {open && (
                <ChevronRight
                  className={cn("w-3.5 h-3.5 flex-shrink-0 transition-opacity", isOpen ? "opacity-100" : "opacity-50")}
                />
              )}
              {holdsActive && !open && (
                <span className="absolute right-1 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Group flyout — fixed so the nav's overflow can't clip it. */}
      {flyoutGroup && flyout && (
        <div
          role="menu"
          aria-label={flyoutGroup.label}
          style={{ top: flyout.top, left: flyout.left }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-50 w-52 rounded-2xl bg-popover shadow-xl p-1.5"
        >
          <p className="px-2.5 pt-1.5 pb-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {flyoutGroup.label}
          </p>
          <div className="space-y-0.5">
            {flyoutGroup.items.map((item) => renderLeaf(item, true))}
          </div>
        </div>
      )}

      {/* User section */}
      <div className={cn("border-t border-sidebar-border p-2 flex-shrink-0", !open && "flex justify-center")}>
        {open ? (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar src={avatar} name={user.name} className="w-7 h-7" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{user.name ?? "User"}</p>
              {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
            </div>
            <button
              onClick={() => logoutMutation.mutate()}
              className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-2 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
