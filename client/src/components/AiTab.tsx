/**
 * AiTab — a map of every AI-backed function in the app and the model behind it.
 *
 * Static by design: this page documents the current wiring (see server/_core/llm.ts,
 * server/tts.ts, server/googleDrive.ts, and the writing/voice routers), so when the
 * wiring changes, this file is part of that change. Rendered as list-by-list
 * floating cards, matching the Writing rail's design language.
 */
import { Mic, BookOpen, PenLine, Volume2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

/** Provider chip palette — one hue per provider so rows scan at a glance. */
const PROVIDER_CLS: Record<string, string> = {
  OpenAI: "bg-emerald-600/10 text-emerald-700",
  DeepSeek: "bg-indigo-600/10 text-indigo-700",
  Gemini: "bg-sky-600/10 text-sky-700",
  ElevenLabs: "bg-speaking-surface text-speaking",
  Local: "bg-muted text-muted-foreground",
};

function Chip({ provider, label }: { provider: keyof typeof PROVIDER_CLS; label: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap", PROVIDER_CLS[provider])}>
      {label}
    </span>
  );
}

type Row = {
  name: string;
  what: string;
  chips: { provider: keyof typeof PROVIDER_CLS; label: string }[];
};

function Card({ row }: { row: Row }) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3.5 shadow-[0_10px_26px_-12px_rgb(23_63_107_/_0.3)] transition-shadow hover:shadow-[0_14px_32px_-12px_rgb(23_63_107_/_0.45)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-foreground">{row.name}</p>
        <div className="flex flex-wrap justify-end gap-1.5 flex-shrink-0">
          {row.chips.map((c) => <Chip key={c.label} {...c} />)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mt-1">{row.what}</p>
    </div>
  );
}

function Section({ icon, title, rows }: { icon: React.ReactNode; title: string; rows: Row[] }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">
        {icon} {title}
      </h2>
      <div className="space-y-2.5">
        {rows.map((r) => <Card key={r.name} row={r} />)}
      </div>
    </section>
  );
}

const SPEAKING: Row[] = [
  {
    name: "Romain — voice tutor",
    what: "The in-house pipeline: browser speech in, our prompt + LLM, Anna's voice out. The LLM follows each account's voice-model setting (Accounts column), OpenAI by default.",
    chips: [
      { provider: "OpenAI", label: "gpt-4o-mini" },
      { provider: "DeepSeek", label: "deepseek-v4-flash (per-user)" },
    ],
  },
  {
    name: "Anna — voice tutor",
    what: "An ElevenLabs Conversational AI agent: the platform runs the conversation loop, turn-taking, and her voice end-to-end; we mint signed session URLs.",
    chips: [{ provider: "ElevenLabs", label: "Conversational AI agent" }],
  },
  {
    name: "Marc — TCF speaking examiner",
    what: "Also an ElevenLabs agent, driven by the exam workflow graph (three tâches, expression-edge transitions). The client injects the sujet via dynamic variables.",
    chips: [{ provider: "ElevenLabs", label: "Conversational AI agent" }],
  },
  {
    name: "Tutor Chat (text) & voice ask palette",
    what: "Text tutoring, screen-context answers, and the “how do you say X” auto-copy all go through the shared LLM chain.",
    chips: [
      { provider: "OpenAI", label: "gpt-4o-mini" },
      { provider: "DeepSeek", label: "fallback" },
      { provider: "Gemini", label: "2.5-flash (forge fallback)" },
    ],
  },
];

const DICTIONARY: Row[] = [
  {
    name: "Dictionary search",
    what: "Definitions, gender, examples, and the de/à verb-preposition reminders. English queries get a dedicated en→fr resolver pre-step; results cache per word + type/language hint.",
    chips: [
      { provider: "OpenAI", label: "gpt-4o-mini" },
      { provider: "DeepSeek", label: "fallback" },
      { provider: "Gemini", label: "2.5-flash (forge fallback)" },
    ],
  },
  {
    name: "Dictionary precompute",
    what: "The top-6,000 French words were pre-warmed in batches so common lookups never wait on a model. Policy: batch jobs run on DeepSeek, live cache misses on OpenAI.",
    chips: [{ provider: "DeepSeek", label: "deepseek-v4-flash (batch)" }],
  },
  {
    name: "Vocab extraction (Drive sync)",
    what: "Turns synced notes into vocab cards. Batches split-and-retry on truncation; long reasoning output is why DeepSeek gets the batch work.",
    chips: [
      { provider: "DeepSeek", label: "deepseek-v4-flash" },
      { provider: "Gemini", label: "2.5-flash (option)" },
    ],
  },
];

const WRITING: Row[] = [
  {
    name: "Live grammar & accent check",
    what: "Paragraph-scoped as you type, plus the Check-all pass. Gemini is called directly (thinking budget 0) for ~1–2s latency; typography-only “fixes” are filtered out server-side.",
    chips: [
      { provider: "Gemini", label: "gemini-2.5-flash" },
      { provider: "OpenAI", label: "fallback chain" },
    ],
  },
];

const VOICE_SETTINGS: Row[] = [
  {
    name: "Voice — “Anna” (ElevenLabs)",
    what: "Voice ID nVPCtAFzgyMX3FZKNzH0 on eleven_flash_v2_5 with language_code fr, streamed as mp3 44.1 kHz / 64 kbps. Every pronounce button and reader playback uses this one voice.",
    chips: [{ provider: "ElevenLabs", label: "eleven_flash_v2_5 · fr" }],
  },
  {
    name: "Fallback voice",
    what: "If ElevenLabs errors or runs out of credits, synthesis falls through to OpenAI so pronunciation never goes silent.",
    chips: [{ provider: "OpenAI", label: "gpt-4o-mini-tts" }],
  },
  {
    name: "Caching scheme",
    what: "Two layers: in-memory (300 entries) then MySQL tts_cache, keyed by engine version + text — each word or sentence is synthesized once, ever. Bumping the engine version invalidates cleanly.",
    chips: [{ provider: "Local", label: "L1 memory → L2 MySQL" }],
  },
  {
    name: "Human recordings first",
    what: "Single words prefer real speaker audio from Lingua Libre / Wikimedia Commons (word_audio table) before any TTS, fetched politely at 1 req/s with a 15-minute 429 cooldown.",
    chips: [{ provider: "Local", label: "Commons audio" }],
  },
  {
    name: "IPA transcriptions",
    what: "WikiPron's French lexicon (84,402 words) ships with the server and corrects model-written IPA only when they disagree.",
    chips: [{ provider: "Local", label: "WikiPron lexicon" }],
  },
];

export default function AiTab() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Cpu className="w-3.5 h-3.5" /> AI Stack
        </div>
        <h1 className="font-display text-3xl font-bold text-foreground mt-2">
          What runs on which model
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Every AI-backed function in RomainTalk, the model currently behind it, and the
          voice engine's key settings.
        </p>

        <div className="space-y-10 mt-10">
          <Section icon={<Mic className="w-4 h-4 text-speaking" />} title="Conversation & speaking" rows={SPEAKING} />
          <Section icon={<BookOpen className="w-4 h-4 text-primary" />} title="Dictionary & vocabulary" rows={DICTIONARY} />
          <Section icon={<PenLine className="w-4 h-4 text-primary" />} title="Writing" rows={WRITING} />
          <Section icon={<Volume2 className="w-4 h-4 text-speaking" />} title="Voice model — settings & scheme" rows={VOICE_SETTINGS} />
        </div>
      </div>
    </div>
  );
}
