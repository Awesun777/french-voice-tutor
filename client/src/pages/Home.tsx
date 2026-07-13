import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useState, useEffect } from "react";
import { SidebarTab } from "@/types";
import { DictionaryFab, DictionarySearchDrawer } from "@/components/DictionarySearchDrawer";
import Sidebar from "@/components/Sidebar";
import DictionaryTab from "@/components/DictionaryTab";
import LibraryTab from "@/components/LibraryTab";
import QuizTab from "@/components/QuizTab";
import FlashcardTab from "@/components/FlashcardTab";
import GrammarTestTab from "@/components/GrammarTestTab";
import ListeningTab from "@/components/ListeningTab";
import TutorTab from "@/components/TutorTab";
import ProgressTab from "@/components/ProgressTab";
import VoiceAgentChooser from "@/components/VoiceAgentChooser";
import { Loader2, BookOpen } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<SidebarTab>("dictionary");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Set by an import/voice "Review these words" CTA: pre-selects a date in the
  // review launch screen. Cleared on manual sidebar navigation so it doesn't
  // keep forcing an old date.
  const [reviewTarget, setReviewTarget] = useState<{ dateKey: string } | null>(null);
  const startReview = (dateKey?: string) => { setReviewTarget(dateKey ? { dateKey } : null); setActiveTab("flashcards"); };
  const navTab = (tab: SidebarTab) => { setReviewTarget(null); setActiveTab(tab); };

  // Dictionary search drawer — available while practising (flashcards/grammar/quiz).
  const [dictOpen, setDictOpen] = useState(false);
  const dictTabs: SidebarTab[] = ["flashcards", "grammar", "quiz"];
  const dictAvailable = dictTabs.includes(activeTab);
  useEffect(() => { if (!dictAvailable) setDictOpen(false); }, [dictAvailable]);

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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
              <span className="text-4xl">🇫🇷</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
                Le Dictionnaire
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">Your personal French learning companion</p>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              { icon: "📖", label: "AI Dictionary", desc: "Instant lookups with conjugations" },
              { icon: "🧠", label: "Spaced Repetition", desc: "Smart quiz scheduling" },
              { icon: "🃏", label: "Flashcards", desc: "Flip & record your pronunciation" },
              { icon: "📊", label: "Progress Tracking", desc: "Streaks & growth charts" },
            ].map((f) => (
              <div key={f.label} className="bg-card border border-border rounded-xl p-3.5">
                <div className="text-2xl mb-1.5">{f.icon}</div>
                <p className="text-sm font-semibold text-foreground">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>

          <a
            href={getLoginUrl()}
            className="flex items-center justify-center gap-3 w-full py-3.5 px-6 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-xl transition-all duration-200 shadow-lg border border-gray-200 text-center"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>
          <p className="text-xs text-muted-foreground">Free to use · Your data stays private</p>
        </div>
      </div>
    );
  }

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
        {activeTab === "dictionary" && <DictionaryTab />}
        {activeTab === "library" && <LibraryTab setActiveTab={setActiveTab} onStartReview={startReview} />}
        {activeTab === "quiz" && <QuizTab reviewTarget={reviewTarget} />}
        {activeTab === "flashcards" && <FlashcardTab reviewTarget={reviewTarget} />}
        {activeTab === "grammar" && <GrammarTestTab />}
        {activeTab === "listening" && <ListeningTab />}
        {activeTab === "tutor" && <TutorTab />}
        {activeTab === "voice-chat" && <VoiceAgentChooser onStartReview={startReview} />}
        {activeTab === "progress" && <ProgressTab />}
      </main>
      {dictAvailable && (
        <>
          <DictionaryFab open={dictOpen} onOpen={() => setDictOpen(true)} />
          <DictionarySearchDrawer open={dictOpen} onClose={() => setDictOpen(false)} />
        </>
      )}
    </div>
  );
}
