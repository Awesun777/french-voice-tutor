import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect, useRef, useCallback } from "react";
import { SidebarTab } from "@/types";
import { DictionaryFab, DictionarySearchDrawer } from "@/components/DictionarySearchDrawer";
import { VoiceAskDrawer } from "@/components/VoiceAskDrawer";
import Sidebar from "@/components/Sidebar";
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

export default function Home() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>("dashboard");
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
  const dictSuppressed = activeTab === "dictionary" || activeTab === "tutor";
  const [dictSeed, setDictSeed] = useState<string | undefined>(undefined);
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
      setDictSeed(selected && selected.length <= 120 ? selected : undefined);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      // Tutor Chat binds Shift+Return to "new line" in its composer, and any
      // other text field may too, so a focused input always wins. While the
      // palette is open Return means "stop and ask", handled inside it.
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (voiceAskOpenRef.current) return;
      e.preventDefault();
      // Captured here, before the palette opens: showing it takes focus, and on
      // some browsers that collapses the selection. Same trick the dictionary
      // shortcut uses, so highlighting a word in a transcript or an article and
      // asking "what does it mean?" resolves against it.
      const selected = window.getSelection()?.toString().trim() ?? "";
      setVoiceAskContext(selected ? selected.slice(0, 500) : undefined);
      setVoiceAskOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    focusBeforeDict.current?.focus?.();
    focusBeforeDict.current = null;
  }, []);

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
        {activeTab === "reading" && <ReadingTab />}
        {activeTab === "tutor" && <TutorTab />}
        {activeTab === "voice-chat" && <VoiceAgentChooser onStartReview={startReview} />}
        {activeTab === "progress" && <ProgressTab />}
        {activeTab === "settings" && <SettingsTab user={user} />}
      </main>
      {!dictSuppressed && (
        <>
          <DictionaryFab open={dictOpen} onOpen={() => setDictOpen(true)} />
          <DictionarySearchDrawer open={dictOpen} onClose={closeDict} initialTerm={dictSeed} />
        </>
      )}
      {/* Available on every tab, including Tutor Chat — asking out loud is
          useful there too, and the composer keeps Shift+Return for new lines. */}
      <VoiceAskDrawer
        open={voiceAskOpen}
        contextText={voiceAskContext}
        onClose={() => { setVoiceAskOpen(false); setVoiceAskContext(undefined); }}
      />
    </div>
  );
}
