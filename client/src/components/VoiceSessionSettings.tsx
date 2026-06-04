/**
 * VoiceSessionSettings
 *
 * A compact settings panel shown on the idle screen of both the Romain (VoiceChatTab)
 * and Anna (AnnaVoiceTab) voice chat tabs.
 *
 * Controls:
 *  - Speaking speed: Slow / Normal / Fast
 *  - Language mix:   Tout en français / Mix / Tout en anglais
 *
 * Settings are persisted in localStorage under agent-scoped keys so Romain and
 * Anna can have independent preferences.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SpeedLevel = "slow" | "normal" | "fast";
export type LanguageMix = "french" | "mix" | "english";

export interface VoiceSettings {
  speed: SpeedLevel;
  languageMix: LanguageMix;
}

interface Props {
  agent: "romain" | "anna";
  onChange?: (settings: VoiceSettings) => void;
  /** If true, show a compact inline version (for use while session is active) */
  compact?: boolean;
}

const SPEED_LABELS: Record<SpeedLevel, string> = {
  slow: "Slow",
  normal: "Normal",
  fast: "Fast",
};

const MIX_LABELS: Record<LanguageMix, string> = {
  french: "Tout en français",
  mix: "Mix",
  english: "All English",
};

const MIX_SUBLABELS: Record<LanguageMix, string> = {
  french: "Explanations in French only",
  mix: "French first, English when needed",
  english: "Explanations always in English",
};

const SPEED_STEPS: SpeedLevel[] = ["slow", "normal", "fast"];
const MIX_STEPS: LanguageMix[] = ["french", "mix", "english"];

function loadSettings(agent: "romain" | "anna"): VoiceSettings {
  try {
    const raw = localStorage.getItem(`voice_settings_${agent}`);
    if (raw) return JSON.parse(raw) as VoiceSettings;
  } catch { /* ignore */ }
  return { speed: "normal", languageMix: "mix" };
}

function saveSettings(agent: "romain" | "anna", settings: VoiceSettings) {
  try {
    localStorage.setItem(`voice_settings_${agent}`, JSON.stringify(settings));
  } catch { /* ignore */ }
}

/** Returns the system prompt snippet for a given speed level */
export function speedInstruction(speed: SpeedLevel): string {
  switch (speed) {
    case "slow":
      return "Speak slowly and clearly, with deliberate pauses between phrases. Ideal for a beginner who needs time to process.";
    case "fast":
      return "Speak at a natural native pace, as you would with a fluent French speaker.";
    default:
      return "Speak at a comfortable intermediate pace — not too slow, not too fast.";
  }
}

/** Returns the system prompt snippet for a given language mix */
export function languageMixInstruction(mix: LanguageMix): string {
  switch (mix) {
    case "french":
      return "IMPORTANT: Use French exclusively at all times — including all explanations, corrections, and definitions. Never switch to English, even if the student asks. Use simple French to explain French.";
    case "english":
      return "IMPORTANT: When explaining vocabulary, grammar rules, or correcting mistakes, always use English for clarity. Keep the conversation itself in French, but all explanations and corrections must be in English.";
    default:
      return "Use French as the primary language. Switch to English only when the student clearly doesn't understand a word or phrase, or explicitly asks for an English explanation.";
  }
}

/** Returns the ElevenLabs voice speed value for Anna */
export function annaVoiceSpeed(speed: SpeedLevel): number {
  switch (speed) {
    case "slow": return 0.78;
    case "fast": return 1.20;
    default: return 1.0;
  }
}

function ThreeStepSlider<T extends string>({
  steps,
  labels,
  value,
  onChange,
  compact,
}: {
  steps: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const idx = steps.indexOf(value);

  return (
    <div className="w-full">
      {/* Track + knob */}
      <div className="relative flex items-center h-6 mb-1">
        {/* Track */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-border" />
        {/* Filled portion */}
        <div
          className="absolute h-1.5 rounded-full bg-primary transition-all duration-200"
          style={{ width: `${(idx / (steps.length - 1)) * 100}%` }}
        />
        {/* Step dots + invisible hit areas */}
        {steps.map((step, i) => (
          <button
            key={step}
            onClick={() => onChange(step)}
            className="absolute -translate-x-1/2 focus:outline-none group"
            style={{ left: `${(i / (steps.length - 1)) * 100}%` }}
            aria-label={labels[step]}
          >
            <div
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-all duration-200",
                value === step
                  ? "bg-primary border-primary scale-125 shadow-md shadow-primary/40"
                  : "bg-background border-border group-hover:border-primary/60"
              )}
            />
          </button>
        ))}
      </div>
      {/* Labels */}
      <div className="flex justify-between">
        {steps.map((step) => (
          <button
            key={step}
            onClick={() => onChange(step)}
            className={cn(
              "text-xs transition-colors",
              compact ? "text-[10px]" : "",
              value === step ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {labels[step]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VoiceSessionSettings({ agent, onChange, compact }: Props) {
  const [settings, setSettings] = useState<VoiceSettings>(() => loadSettings(agent));

  // Keep a stable ref to onChange so the effect never re-fires due to a new
  // inline arrow function being passed on every render (which would cause an
  // infinite setState loop).
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  // Sync to parent whenever settings change — only depend on settings/agent,
  // never on the onChange prop directly.
  useEffect(() => {
    saveSettings(agent, settings);
    onChangeRef.current?.(settings);
  }, [settings, agent]);

  const update = (patch: Partial<VoiceSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  if (compact) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Session Settings</p>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Speaking speed</p>
          <ThreeStepSlider
            steps={SPEED_STEPS}
            labels={SPEED_LABELS}
            value={settings.speed}
            onChange={(v) => update({ speed: v })}
            compact
          />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Language for explanations</p>
          <ThreeStepSlider
            steps={MIX_STEPS}
            labels={MIX_LABELS}
            value={settings.languageMix}
            onChange={(v) => update({ languageMix: v })}
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 text-left max-w-sm w-full space-y-4">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Session Settings</p>

      {/* Speed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Speaking speed</p>
          <span className="text-xs text-primary font-semibold">{SPEED_LABELS[settings.speed]}</span>
        </div>
        <ThreeStepSlider
          steps={SPEED_STEPS}
          labels={SPEED_LABELS}
          value={settings.speed}
          onChange={(v) => update({ speed: v })}
        />
      </div>

      {/* Language mix */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Language for explanations</p>
          <span className="text-xs text-primary font-semibold">{MIX_LABELS[settings.languageMix]}</span>
        </div>
        <ThreeStepSlider
          steps={MIX_STEPS}
          labels={MIX_LABELS}
          value={settings.languageMix}
          onChange={(v) => update({ languageMix: v })}
        />
        <p className="text-[10px] text-muted-foreground">{MIX_SUBLABELS[settings.languageMix]}</p>
      </div>
    </div>
  );
}

/** Hook to read/write voice settings for a given agent */
export function useVoiceSettings(agent: "romain" | "anna") {
  const [settings, setSettings] = useState<VoiceSettings>(() => loadSettings(agent));

  const update = (patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(agent, next);
      return next;
    });
  };

  return { settings, update };
}
