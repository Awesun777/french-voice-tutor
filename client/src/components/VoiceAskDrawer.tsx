/**
 * VoiceAskDrawer — ask the French tutor a question out loud.
 *
 * Opened with Shift+Return from anywhere. Records, transcribes, and shows the
 * tutor's written answer, in the same bottom-rising palette the dictionary
 * shortcut uses so the two shortcuts feel like one family.
 *
 * Recording starts the moment it opens: the shortcut exists so you can ask
 * without breaking stride, and a palette that then makes you click a button
 * would defeat that.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Mic, Square, Loader2, X, MessageCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { usePronounce } from "@/lib/pronounce";
import { PronounceButton } from "@/components/PronounceButton";

type Phase = "recording" | "thinking" | "answered" | "error";

/** Formats fall back in order — Safari does not support webm/opus. */
const MIME_PREFS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_PREFS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function VoiceAskDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("recording");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  /** Set when the user closes mid-recording, so the audio is thrown away. */
  const abortedRef = useRef(false);

  const utils = trpc.useUtils();
  const { speak, state: pronounceState, activeText } = usePronounce();
  const voiceAsk = trpc.tutor.voiceAsk.useMutation();

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const send = useCallback(
    async (blob: Blob, mime: string) => {
      setPhase("thinking");
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("Couldn't read the recording"));
          reader.readAsDataURL(blob);
        });
        const res = await voiceAsk.mutateAsync({
          base64,
          mimeType: mime || "audio/webm",
          filename: `question.${extFor(mime)}`,
        });
        setQuestion(res.question);
        setReply(res.reply);
        setPhase("answered");
        // The exchange is saved to the same history Tutor Chat reads.
        utils.tutor.history.invalidate();
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
        setPhase("error");
      }
    },
    [voiceAsk, utils]
  );

  const beginRecording = useCallback(async () => {
    abortedRef.current = false;
    setPhase("recording");
    setQuestion("");
    setReply("");
    setErrorMsg("");
    setSeconds(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stopTracks();
        if (abortedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size < 1000) {
          setErrorMsg("That was too short — hold the shortcut and speak.");
          setPhase("error");
          return;
        }
        send(blob, mime);
      };
      rec.start();
    } catch {
      setErrorMsg("Microphone access was blocked. Allow it in your browser settings.");
      setPhase("error");
    }
  }, [send, stopTracks]);

  // Start on open, tear down on close. Everything the recorder holds — the mic
  // stream especially — has to be released or the tab keeps the mic light on.
  useEffect(() => {
    if (!open) return;
    beginRecording();
    return () => {
      abortedRef.current = true;
      try {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      } catch { /* already stopped */ }
      stopTracks();
    };
    // beginRecording is stable for a given open session; re-running it on
    // identity changes would restart the recording mid-question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Elapsed timer, and a hard stop so a forgotten palette can't record forever.
  useEffect(() => {
    if (!open || phase !== "recording") return;
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= 60) {
          try { recorderRef.current?.stop(); } catch { /* ignore */ }
        }
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, phase]);

  const stopAndSend = () => {
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch { /* ignore */ }
  };

  // Escape closes; Return while recording sends, matching how the shortcut was
  // invoked in the first place.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Enter" && phase === "recording") { e.preventDefault(); stopAndSend(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, onClose]);

  if (!open) return null;

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />
      <aside className="fixed z-50 inset-x-0 bottom-0 sm:bottom-6 flex justify-center px-0 sm:px-4 pointer-events-none">
        <div className="pointer-events-auto w-full sm:max-w-2xl max-h-[76vh] flex flex-col bg-popover rounded-t-3xl sm:rounded-3xl ring-1 ring-black/5 shadow-[0_24px_60px_-12px_rgb(23_63_107_/_0.45)] animate-in fade-in slide-in-from-bottom-8 duration-200 ease-out overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-5 pt-4 pb-3">
            <MessageCircle className="w-4 h-4 text-speaking" />
            <p className="text-sm font-bold text-foreground flex-1">Ask your tutor</p>
            <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">esc</kbd>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-5 overflow-y-auto">
            {phase === "recording" && (
              <div className="flex flex-col items-center py-6">
                {/* Pulsing mic: the palette opens straight into recording, so it
                    has to be unmistakable that it is already listening. */}
                <div className="relative">
                  <span className="absolute inset-0 rounded-full bg-speaking/30 animate-ping" />
                  <div className="relative w-16 h-16 rounded-full bg-speaking text-white flex items-center justify-center">
                    <Mic className="w-7 h-7" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground mt-5">Listening… {mmss}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask in English or French — "how do I say I'm hungry?"
                </p>
                <button
                  onClick={stopAndSend}
                  className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-[0_8px_20px_-8px_rgb(23_63_107_/_0.8)] hover:bg-primary/90 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" /> Stop & ask
                </button>
                <p className="text-[11px] text-muted-foreground mt-2">or press Return</p>
              </div>
            )}

            {phase === "thinking" && (
              <div className="flex flex-col items-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground mt-3">Transcribing and asking your tutor…</p>
              </div>
            )}

            {phase === "answered" && (
              <div className="space-y-4 py-1">
                <div className="rounded-2xl bg-muted/50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">You asked</p>
                  <p className="text-sm text-foreground mt-1">{question}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-speaking">Tutor</p>
                    <PronounceButton
                      text={reply}
                      speak={speak}
                      state={pronounceState}
                      activeText={activeText}
                      className="p-1 bg-primary/15 hover:bg-primary/25 text-primary"
                      iconSize="w-3 h-3"
                    />
                  </div>
                  <p className="text-sm text-foreground mt-1.5 whitespace-pre-wrap leading-relaxed">{reply}</p>
                </div>
                <button
                  onClick={beginRecording}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted/60 text-foreground text-sm font-bold hover:bg-muted transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Ask another
                </button>
              </div>
            )}

            {phase === "error" && (
              <div className="flex flex-col items-center py-8">
                <p className={cn("text-sm text-center", "text-destructive")}>{errorMsg}</p>
                <button
                  onClick={beginRecording}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  <Mic className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
