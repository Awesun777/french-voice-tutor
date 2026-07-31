import { useState, useEffect } from "react";
import { SidebarTab } from "@/types";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  BookMarked,
  Brain,
  CreditCard,
  MessageCircle,
  Mic,
  BarChart3,
  GraduationCap,
  Headphones,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface SidebarProps {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  user: { name?: string | null; email?: string | null };
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
  items: Omit<NavLeaf, "kind">[];
}
type NavEntry = NavLeaf | NavGroup;

const ICON = "w-4.5 h-4.5";

const NAV: NavEntry[] = [
  { kind: "leaf", id: "dictionary", label: "Dictionary", icon: <BookOpen className={ICON} /> },
  { kind: "leaf", id: "tutor", label: "Tutor Chat", icon: <MessageCircle className={ICON} /> },
  { kind: "leaf", id: "voice-chat", label: "Voice Chat", icon: <Mic className={ICON} /> },
  {
    kind: "group",
    id: "vocab-review",
    label: "Vocab Review",
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
    items: [
      { id: "listening", label: "Listening Lab", icon: <Headphones className={ICON} /> },
      { id: "grammar", label: "Grammar Test", icon: <GraduationCap className={ICON} /> },
    ],
  },
];

/** Every leaf in order, ignoring grouping — used by the collapsed rail. */
const ALL_LEAVES: Omit<NavLeaf, "kind">[] = NAV.flatMap((e) =>
  e.kind === "leaf" ? [{ id: e.id, label: e.label, icon: e.icon }] : e.items
);

const GROUPS_KEY = "sidebar-groups-v1";
const DEFAULT_GROUPS: Record<string, boolean> = { "vocab-review": true, "test-prep": true };

export default function Sidebar({ activeTab, setActiveTab, open, setOpen, user }: SidebarProps) {
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.reload(); },
    onError: () => toast.error("Logout failed"),
  });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "null");
      if (saved && typeof saved === "object") return { ...DEFAULT_GROUPS, ...saved };
    } catch {
      // Malformed or unavailable storage — fall through to defaults.
    }
    return DEFAULT_GROUPS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups));
    } catch {
      // Storage unavailable or over quota — a lost fold state is not worth failing over.
    }
  }, [openGroups]);

  // Reveal the group holding the active tab. Other tabs can switch the tab
  // programmatically (the voice session's "review these words" CTA jumps to
  // Flashcards), and landing on a tab hidden inside a collapsed group would
  // leave the sidebar looking like nothing is selected.
  useEffect(() => {
    const owner = NAV.find(
      (e): e is NavGroup => e.kind === "group" && e.items.some((i) => i.id === activeTab)
    );
    if (!owner) return;
    setOpenGroups((prev) => (prev[owner.id] ? prev : { ...prev, [owner.id]: true }));
  }, [activeTab]);

  const renderLeaf = (item: Omit<NavLeaf, "kind">, nested: boolean) => (
    <button
      key={item.id}
      onClick={() => setActiveTab(item.id)}
      className={cn(
        "w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        !open && "justify-center px-2",
        open && nested && "pl-5",
        activeTab === item.id
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
      title={!open ? item.label : undefined}
    >
      <span className={cn("flex-shrink-0", activeTab === item.id ? "text-primary" : "")}>
        {item.icon}
      </span>
      {open && <span className="truncate">{item.label}</span>}
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

      {/* Navigation. Collapsed to w-14 there is no room for group labels, so the
          rail flattens to every leaf in order — a headerless group would just be
          an unexplained gap. */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {!open
          ? ALL_LEAVES.map((item) => renderLeaf(item, false))
          : NAV.map((entry) => {
              if (entry.kind === "leaf") return renderLeaf(entry, false);
              const isOpen = openGroups[entry.id] ?? true;
              const holdsActive = entry.items.some((i) => i.id === activeTab);
              return (
                <div key={entry.id}>
                  <button
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [entry.id]: !(prev[entry.id] ?? true) }))
                    }
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-1.5 px-2.5 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn("w-3 h-3 flex-shrink-0 transition-transform", !isOpen && "-rotate-90")}
                    />
                    <span className="truncate">{entry.label}</span>
                    {/* Folded away, the group still has to show that the current
                        tab lives inside it. */}
                    {!isOpen && holdsActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5">
                      {entry.items.map((item) => renderLeaf(item, true))}
                    </div>
                  )}
                </div>
              );
            })}
      </nav>

      {/* User section */}
      <div className={cn("border-t border-sidebar-border p-2 flex-shrink-0", !open && "flex justify-center")}>
        {open ? (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
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
