import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect, useRef, useCallback } from "react";
import { SidebarTab } from "@/types";
import { DictionaryFab, DictionarySearchDrawer } from "@/components/DictionarySearchDrawer";
import { VoiceAskDrawer } from "@/components/VoiceAskDrawer";
import { getScreenContext } from "@/lib/screenContext";
import Sidebar from "@/components/Sidebar";
import IngestTab from "@/components/IngestTab";
import OpsTab from "@/components/OpsTab";
import TestLogsTab from "@/components/TestLogsTab";
import AccountsTab from "@/components/AccountsTab";
import WorkflowTab from "@/components/WorkflowTab";
import LandingPage from "@/components/LandingPage";
import DashboardTab from "@/components/DashboardTab";
import DictionaryTab from "@/components/DictionaryTab";
import LibraryTab from "@/components/LibraryTab";
import QuizTab from "@/components/QuizTab";
import FlashcardTab from "@/components/FlashcardTab";
import GrammarTestTab from "@/components/GrammarTestTab";
import ListeningTab from "@/components/ListeningTab";
import ReadingTab from "@/components/ReadingTab";
import TutorTab from "@/components/TutorTab";
import ProgressTab from "@/components/ProgressTab";
import SettingsTab from "@/components/SettingsTab";
import VoiceAgentChooser from "@/components/VoiceAgentChooser";
import { Loader2, BookOpen } from "lucide-react";

/**
 * The sentence the current selection sits in, for the dictionary drawer's
 * "In this context" analysis — same trick the browser extension uses. Walks up
 * to the enclosing block, then trims to sentence boundaries around the term.
 */
function surroundingSentence(term: string): string | undefined {
  try {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node) return undefined;
    const block =
      (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest(
        "p, li, blockquote, h1, h2, h3, figcaption, td, dd, article, section"
      ) ?? (node.nodeType === Node.TEXT_NODE ? node.parentElement : null);
    if (!block) return undefined;
    const text = (block.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return undefined;
    if (text.length <= 400) return text;
    const at = text.indexOf(term);
    if (at === -1) return text.slice(0, 400);
    const before = text.slice(0, at);
    const after = text.slice(at + term.length);
    const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
    const endRel = after.search(/[.!?…]\s/);
    return text
      .slice(start === -1 ? 0 : start + 2, at + term.length + (endRel === -1 ? after.length : endRel + 1))
      .trim()
      .slice(0, 400);
  } catch {
    return undefined;
  }
}

const TAB_IDS: SidebarTab[] = ["dashboard", "dictionary", "library", "quiz", "flashcards", "grammar", "listening", "reading", "tutor", "voice-chat", "progress", "settings", "ingest", "ops", "testlogs", "accounts", "workflow"];
const ADMIN_TABS: SidebarTab[] = ["ingest", "ops", "testlogs", "accounts", "workflow"];

/**
 * Which tab to open on load: the URL hash wins (survives refresh AND makes
 * sections linkable), then the last tab this browser was on, then Dashboard.
 */
function initialTab(): SidebarTab {
  const fromHash = window.location.hash.replace(/^#/, "") as SidebarTab;
  if (TAB_IDS.includes(fromHash)) return fromHash;
  const stored = localStorage.getItem("rt-active-tab") as SidebarTab | null;
  if (stored && TAB_IDS.includes(stored)) return stored;
  return "dashboard";
}

export default function Home() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab);

  // Persist the section in the URL (replaceState — switching tabs shouldn't
  // pile up history entries) and in localStorage, so a refresh, a reopened
  // browser, or a pasted link all land where the user was.
  useEffect(() => {
    window.history.replaceState(null, "", `#${activeTab}`);
    localStorage.setItem("rt-active-tab", activeTab);
  }, [activeTab]);

  // Back/forward or a hand-edited hash still navigates.
  useEffect(() => {
    const onHash = () => {
      const t = window.location.hash.replace(/^#/, "") as SidebarTab;
      if (TAB_IDS.includes(t)) setActiveTab(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A non-admin restoring an admin tab (stale hash, shared link) would land on
  // a blank pane; bounce to the dashboard once the role is known.
  useEffect(() => {
    if (!loading && ADMIN_TABS.includes(activeTab) && user?.role !== "admin") {
      setActiveTab("dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, activeTab]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Set by an import/voice "Review these words" CTA: pre-selects a date in the
  // review launch screen. Cleared on manual sidebar navigation so it doesn't
  // keep forcing an old date.
  const [reviewTarget, setReviewTarget] = useState<{ dateKey: string } | null>(null);
  const startReview = (dateKey?: string) => { setReviewTarget(dateKey ? { dateKey } : null); setActiveTab("flashcards"); };
  const navTab = (tab: SidebarTab) => { setReviewTarget(null); setActiveTab(tab); };

  // Dictionary lookup palette — Shift+\ or the floating button. Skipped on
  // the Dictionary and Tutor Chat tabs, where a search box is already the main
  // UI and a second one would just be in the way.
  const [dictOpen, setDictOpen] = useState(false);
  // Read via refs inside the once-bound key listeners (palette swap).
  const dictOpenRef = useRef(false);
  dictOpenRef.current = dictOpen;
  const closeDictRef = useRef<() => void>(() => {});
  const dictSuppressed = activeTab === "dictionary" || activeTab === "tutor";
  const [dictSeed, setDictSeed] = useState<string | undefined>(undefined);
  /** The sentence the selection sat in — fuels the drawer's "In this context". */
  const [dictSentence, setDictSentence] = useState<string | undefined>(undefined);
  // Where focus was when the drawer opened, so Escape can put it back.
  const focusBeforeDict = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Shift+\ (the "|" key). Every ⌘ chord we tried failed the same way:
      // macOS hands menu-bar key equivalents to the application before the page
      // sees them, so preventDefault never gets a chance — ⌘Q quits, ⌘E is
      // Edit ▸ Find ▸ Use Selection for Find, ⌘1-9 switch tabs. A plain
      // printable key is never a menu equivalent, so nothing can intercept it.
      // Shift+Tab is out for a different reason: keyboard and screen-reader
      // users need it to focus the previous element.
      //
      // Matched on `code` (physical key) rather than `key` (the character), so
      // it lands in the same place on AZERTY and other layouts where Shift+\
      // produces something other than "|".
      if (e.code !== "Backslash" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (suppressedRef.current) return;
      // The flip side of using a printable key: it must never steal a real "|"
      // from someone typing. Anything focused that accepts text is off limits.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      // A selection anywhere becomes the query, so you can highlight a word in
      // a transcript or a tutor reply and look it up without retyping it.
      const selected = window.getSelection()?.toString().trim() ?? "";
      focusBeforeDict.current = document.activeElement as HTMLElement | null;
      const seeded = !!selected && selected.length <= 120;
      setDictSeed(seeded ? selected : undefined);
      // Captured now, before the drawer takes focus and the selection collapses.
      setDictSentence(seeded ? surroundingSentence(selected) : undefined);
      // One palette at a time: opening the dictionary replaces the voice one.
      setVoiceAskOpen(false);
      setDictOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Voice question palette — Shift+Return. Records straight away, transcribes,
  // and shows the tutor's written answer.
  const [voiceAskOpen, setVoiceAskOpen] = useState(false);
  const [voiceAskContext, setVoiceAskContext] = useState<string | undefined>(undefined);
  const voiceAskOpenRef = useRef(false);
  voiceAskOpenRef.current = voiceAskOpen;
  /**
   * Bumped when either held key is released. Push-to-talk: recording runs only
   * while Shift+Return are down.
   *
   * Tracked here rather than in the palette because the release can land before
   * the palette has mounted — on a quick tap the keyup would otherwise be lost
   * and the recording would run on with nobody holding anything.
   */
  const [voiceAskRelease, setVoiceAskRelease] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      // Tutor Chat binds Shift+Return to "new line" in its composer, and any
      // other text field may too, so a focused input always wins. While the
      // palette is open Return means "stop and ask", handled inside it.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (voiceAskOpenRef.current) {
        // The chord is held for push-to-talk, so keydown REPEATS keep landing
        // here while the palette is open. They must still be swallowed —
        // returning without preventDefault let each repeat activate whatever
        // was focused underneath (a flashcard grade button graded a card per
        // repeat, flinging the deck around mid-recording).
        e.preventDefault();
        return;
      }
      e.preventDefault();
      // Captured here, before the palette opens: showing it takes focus, and on
      // some browsers that collapses the selection. Same trick the dictionary
      // shortcut uses, so highlighting a word in a transcript or an article and
      // asking "what does it mean?" resolves against it.
      // An explicit selection wins; otherwise fall back to whatever the
      // active tab says is on screen (current flashcard, quiz question,
      // playing video line) so "break down this sentence" needs no selecting.
      const selected = window.getSelection()?.toString().trim() ?? "";
      const ctx = selected || getScreenContext() || "";
      setVoiceAskContext(ctx ? ctx.slice(0, 500) : undefined);
      // One palette at a time: opening voice replaces the dictionary drawer.
      if (dictOpenRef.current) closeDictRef.current();
      setVoiceAskOpen(true);
    };
    // Letting go of either key ends the recording. Both are watched because
    // there is no telling which one the user lifts first.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== "Shift") return;
      if (!voiceAskOpenRef.current) return;
      setVoiceAskRelease((n) => n + 1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Read through a ref so the key listener stays mounted once rather than
  // re-binding on every tab change.
  const suppressedRef = useRef(dictSuppressed);
  suppressedRef.current = dictSuppressed;

  // Leaving a tab with the palette open should close it.
  useEffect(() => { if (dictSuppressed) setDictOpen(false); }, [dictSuppressed]);

  const closeDict = useCallback(() => {
    setDictOpen(false);
    setDictSeed(undefined);
    setDictSentence(undefined);
    focusBeforeDict.current?.focus?.();
    focusBeforeDict.current = null;
  }, []);
  closeDictRef.current = closeDict;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) return <LandingPage />;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={navTab}
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        user={user}
      />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {activeTab === "dashboard" && <DashboardTab setActiveTab={navTab} />}
        {activeTab === "dictionary" && <DictionaryTab />}
        {activeTab === "library" && <LibraryTab setActiveTab={setActiveTab} onStartReview={startReview} />}
        {activeTab === "quiz" && <QuizTab reviewTarget={reviewTarget} />}
        {activeTab === "flashcards" && <FlashcardTab reviewTarget={reviewTarget} />}
        {activeTab === "grammar" && <GrammarTestTab />}
        {activeTab === "listening" && <ListeningTab />}
        {activeTab === "ingest" && user?.role === "admin" && <IngestTab />}
        {activeTab === "ops" && user?.role === "admin" && <OpsTab />}
        {activeTab === "testlogs" && user?.role === "admin" && <TestLogsTab />}
        {activeTab === "accounts" && user?.role === "admin" && <AccountsTab />}
            {activeTab === "workflow" && user?.role === "admin" && <WorkflowTab />}
        {activeTab === "reading" && <ReadingTab />}
        {activeTab === "tutor" && <TutorTab />}
        {activeTab === "voice-chat" && <VoiceAgentChooser onStartReview={startReview} />}
        {activeTab === "progress" && <ProgressTab />}
        {activeTab === "settings" && <SettingsTab user={user} />}
      </main>
      {!dictSuppressed && (
        <>
          <DictionaryFab open={dictOpen} onOpen={() => setDictOpen(true)} />
          <DictionarySearchDrawer open={dictOpen} onClose={closeDict} initialTerm={dictSeed} contextSentence={dictSentence} />
        </>
      )}
      {/* Available on every tab, including Tutor Chat — asking out loud is
          useful there too, and the composer keeps Shift+Return for new lines. */}
      <VoiceAskDrawer
        open={voiceAskOpen}
        contextText={voiceAskContext}
        releaseSignal={voiceAskRelease}
        onClose={() => { setVoiceAskOpen(false); setVoiceAskContext(undefined); }}
      />
    </div>
  );
}
