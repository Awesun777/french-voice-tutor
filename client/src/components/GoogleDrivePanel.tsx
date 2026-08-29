/**
 * GoogleDrivePanel
 *
 * Shows in the My Library tab:
 * - Connect / disconnect Google account
 * - Source doc URL input + Sync Now button (with SSE streaming progress)
 * - Year-picker dialog when dates lack a year
 * - Export library to Google Drive button
 * - Pending imports two-level review queue:
 *     Level 1 — group overview sorted newest-first (date + topic + word count)
 *               with Accept Group / Skip Group / Review Words controls
 *     Level 2 — per-word accept/skip within an expanded group
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getDriveConnectUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Upload,
  Unlink,
  Check,
  X,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── SSE step types ────────────────────────────────────────────────────────────
type SyncStep =
  | { step: "connecting" }
  | { step: "reading_doc" }
  | { step: "analysing"; chunk: number; total: number }
  | { step: "needs_year"; dates: string[] }
  | { step: "saving"; count: number }
  | { step: "done"; found: number }
  | { step: "error"; message: string };

function stepToMessage(event: SyncStep): string {
  switch (event.step) {
    case "connecting":   return "Connecting to Google Drive…";
    case "reading_doc":  return "Reading your document…";
    case "analysing":    return `Analysing section ${event.chunk} of ${event.total}…`;
    case "saving":       return event.count > 0 ? `Saving ${event.count} new word${event.count === 1 ? "" : "s"}…` : "No new words found.";
    case "done":         return event.found > 0 ? `Done — found ${event.found} new word${event.found === 1 ? "" : "s"}` : "Done — no new words found";
    case "error":        return `Error: ${event.message}`;
    case "needs_year":   return "Some dates are missing a year — please confirm below.";
    default:             return "";
  }
}

/** Parse a dateKey string to a sortable number (ms since epoch, or 0 if unparseable) */
function dateKeyToMs(dateKey: string): number {
  const d = new Date(dateKey);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Format a dateKey for display */
function formatDateKey(dateKey: string): string {
  const d = new Date(dateKey);
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function GoogleDrivePanel({ onStartReview }: { onStartReview?: (dateKey?: string) => void } = {}) {
  const utils = trpc.useUtils();
  const reduceMotion = useReducedMotion();
  const [docUrl, setDocUrl] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  /** Drive settings stay folded away; the bar sits above the library. */
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState<"deepseek-v4-flash" | "gemini-2.5-flash">("deepseek-v4-flash");
  // Track which groups are expanded for per-word review
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // SSE sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncError, setSyncError] = useState<string>("");
  /** Determinate progress from "analysing chunk/total" events; null = unknown. */
  const [syncProgress, setSyncProgress] = useState<{ chunk: number; total: number } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Year picker state
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [ambiguousDates, setAmbiguousDates] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  const { data: status, isLoading: statusLoading } = trpc.google.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Load per-user extraction model preference
  const { data: driveSettings } = trpc.google.getSettings.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Sync model selector with loaded settings
  const loadedModel = driveSettings?.extractionModel;
  const [modelInitialized, setModelInitialized] = useState(false);
  if (!modelInitialized && loadedModel) {
    setSelectedModel(loadedModel);
    setModelInitialized(true);
  }

  // Auto-sync schedule selector, synced with loaded settings
  const [autoSync, setAutoSync] = useState<"off" | "daily" | "weekly">("off");
  const loadedAutoSync = driveSettings?.autoSyncFrequency;
  const [autoSyncInitialized, setAutoSyncInitialized] = useState(false);
  if (!autoSyncInitialized && loadedAutoSync) {
    setAutoSync(loadedAutoSync);
    setAutoSyncInitialized(true);
  }

  const { data: pendingImports = [], isLoading: pendingLoading } = trpc.google.getPendingImports.useQuery(
    undefined,
    { enabled: showQueue }
  );

  const disconnectMutation = trpc.google.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      utils.google.status.invalidate();
    },
    onError: () => toast.error("Failed to disconnect"),
  });

  const saveSettingsMutation = trpc.google.saveSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.google.status.invalidate();
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const exportMutation = trpc.google.exportLibrary.useMutation({
    onSuccess: (data) => {
      toast.success("Library exported to Google Drive!", {
        action: {
          label: "Open Doc",
          onClick: () => window.open(data.url, "_blank"),
        },
      });
      utils.google.status.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Export failed"),
  });

  const acceptMutation = trpc.google.acceptImport.useMutation({
    onSuccess: () => {
      utils.google.getPendingImports.invalidate();
      utils.google.status.invalidate();
      utils.vocab.list.invalidate();
    },
    onError: () => toast.error("Failed to add word"),
  });

  const acceptAllMutation = trpc.google.acceptAllImports.useMutation({
    onSuccess: (data) => {
      toast.success(`Added ${data.added} word${data.added === 1 ? "" : "s"} to your library`, {
        action: onStartReview && data.added > 0
          ? { label: "Review now", onClick: () => onStartReview() }
          : undefined,
      });
      utils.google.getPendingImports.invalidate();
      utils.google.status.invalidate();
      utils.vocab.list.invalidate();
      utils.review.getDates.invalidate();
      utils.review.getStats.invalidate();
      setShowQueue(false);
    },
    onError: () => toast.error("Failed to add words"),
  });

  const skipMutation = trpc.google.skipImport.useMutation({
    onSuccess: () => {
      utils.google.getPendingImports.invalidate();
      utils.google.status.invalidate();
    },
    onError: () => toast.error("Failed to skip"),
  });

  const acceptGroupMutation = trpc.google.acceptGroup.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Added ${data.added} word${data.added === 1 ? "" : "s"} from group`, {
        action: onStartReview && data.added > 0
          ? { label: "Review now", onClick: () => onStartReview(variables.dateKey) }
          : undefined,
      });
      utils.google.getPendingImports.invalidate();
      utils.google.status.invalidate();
      utils.vocab.list.invalidate();
      utils.review.getDates.invalidate();
      utils.review.getStats.invalidate();
      // Collapse the group after accepting
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.delete(variables.dateKey);
        return next;
      });
    },
    onError: () => toast.error("Failed to add group"),
  });

  const skipGroupMutation = trpc.google.skipGroup.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Group skipped");
      utils.google.getPendingImports.invalidate();
      utils.google.status.invalidate();
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        next.delete(variables.dateKey);
        return next;
      });
    },
    onError: () => toast.error("Failed to skip group"),
  });

  // ── SSE sync ────────────────────────────────────────────────────────────────
  const startSyncStream = useCallback((url: string) => {
    if (esRef.current) {
      esRef.current.close();
    }
    setSyncing(true);
    setSyncError("");
    setSyncStatus("Connecting…");
    setSyncProgress(null);

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: SyncStep = JSON.parse(e.data);
        setSyncStatus(stepToMessage(event));
        if (event.step === "analysing") setSyncProgress({ chunk: event.chunk, total: event.total });

        if (event.step === "needs_year") {
          setAmbiguousDates(event.dates);
          setShowYearPicker(true);
          es.close();
          setSyncing(false);
          return;
        }

        if (event.step === "done") {
          setSyncing(false);
          es.close();
          utils.google.status.invalidate();
          utils.google.getPendingImports.invalidate();
          if (event.found > 0) {
            setShowQueue(true);
          }
        }

        if (event.step === "error") {
          setSyncError(event.message);
          setSyncing(false);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setSyncError("Connection lost. Please try again.");
      setSyncing(false);
      es.close();
    };
  }, [utils]);

  const handleSyncNow = useCallback(() => {
    startSyncStream("/api/google/sync-stream");
  }, [startSyncStream]);

  const handleYearConfirm = useCallback(() => {
    setShowYearPicker(false);
    startSyncStream(`/api/google/sync-stream?year=${selectedYear}`);
  }, [selectedYear, startSyncStream]);

  const handleYearSkip = useCallback(() => {
    setShowYearPicker(false);
    startSyncStream(`/api/google/sync-stream?year=${new Date().getFullYear()}`);
  }, [startSyncStream]);

  const toggleGroupExpand = useCallback((dateKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  if (statusLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading Google Drive status…</span>
      </div>
    );
  }

  const pendingCount = status?.pendingCount ?? 0;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  // Build groups: one entry per unique dateKey, collecting all sub-labels and items
  // Sort newest-first by dateKey
  const groupMap = new Map<string, {
    dateKey: string;
    labels: Set<string>;
    items: typeof pendingImports;
  }>();
  for (const item of pendingImports) {
    if (!groupMap.has(item.dateKey)) {
      groupMap.set(item.dateKey, { dateKey: item.dateKey, labels: new Set(), items: [] });
    }
    const g = groupMap.get(item.dateKey)!;
    if (item.groupLabel) g.labels.add(item.groupLabel);
    g.items.push(item);
  }
  const sortedGroups = Array.from(groupMap.values()).sort(
    (a, b) => dateKeyToMs(b.dateKey) - dateKeyToMs(a.dateKey)
  );

  const lastSynced = status?.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* One compact bar. Everything that isn't "sync now" hides behind the gear:
          this sits above the library and used to push it off the screen. */}
      <div className="rounded-2xl bg-card shadow-[0_2px_12px_-4px_rgb(23_63_107_/_0.2)] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
              <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
              <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
              <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
              <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
              <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
              <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground leading-tight">Google Drive</p>
            <p className="text-xs text-muted-foreground truncate">
              {!status?.connected
                ? "Not connected"
                : syncing
                  ? (syncStatus || "Syncing…")
                  : syncError
                    ? <span className="text-destructive">{syncError}</span>
                    : (
                      <>
                        {autoSync === "off" ? "Manual sync" : `Syncs ${autoSync}`}
                        {lastSynced ? ` · last ${lastSynced}` : ""}
                      </>
                    )}
            </p>
          </div>

          {status?.connected ? (
            <>
              {pendingCount > 0 && (
                <button
                  onClick={() => setShowQueue(true)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-full bg-speaking-surface text-speaking text-xs font-bold hover:bg-speaking/20 transition-colors"
                >
                  {pendingCount} pending
                </button>
              )}
              <button
                onClick={handleSyncNow}
                disabled={syncing || (!docUrl && !status.sourceDocUrl)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-[0_6px_16px_-8px_rgb(23_63_107_/_0.8)] hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                onClick={() => setShowDriveSettings((v) => !v)}
                aria-expanded={showDriveSettings}
                aria-label="Drive settings"
                className="flex-shrink-0 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <Settings2 className={cn("w-4 h-4 transition-transform", showDriveSettings && "rotate-90")} />
              </button>
            </>
          ) : (
            <a
              href={getDriveConnectUrl()}
              className="flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-card text-foreground text-xs font-bold shadow-[0_2px_10px_-4px_rgb(23_63_107_/_0.3)] hover:shadow-[0_8px_20px_-8px_rgb(23_63_107_/_0.4)] transition-shadow"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect
            </a>
          )}
        </div>

        <AnimatePresence initial={false}>
          {status?.connected && showDriveSettings && (
            <motion.div
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Extraction model */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Model</p>
                    <div className="flex gap-1 p-1 rounded-lg bg-muted/60">
                      {([
                        { id: "deepseek-v4-flash", label: "DeepSeek" },
                        { id: "gemini-2.5-flash", label: "Gemini" },
                      ] as const).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedModel(m.id);
                            saveSettingsMutation.mutate({ extractionModel: m.id });
                          }}
                          className={cn(
                            "flex-1 py-1.5 rounded-md text-xs font-bold transition-colors",
                            selectedModel === m.id
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-sync schedule */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Auto-sync</p>
                    <div className="flex gap-1 p-1 rounded-lg bg-muted/60">
                      {(["off", "daily", "weekly"] as const).map((freq) => (
                        <button
                          key={freq}
                          onClick={() => {
                            setAutoSync(freq);
                            saveSettingsMutation.mutate({ autoSyncFrequency: freq });
                          }}
                          className={cn(
                            "flex-1 py-1.5 rounded-md text-xs font-bold capitalize transition-colors",
                            autoSync === freq
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {freq}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Source doc */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Source doc</p>
                  <div className="flex gap-2">
                    <Input
                      value={docUrl || status.sourceDocUrl || ""}
                      onChange={(e) => setDocUrl(e.target.value)}
                      placeholder="https://docs.google.com/document/d/…"
                      className="text-xs h-8 bg-muted/50 border-0"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => saveSettingsMutation.mutate({ sourceDocUrl: docUrl || status.sourceDocUrl || "" })}
                      disabled={saveSettingsMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                  {autoSync !== "off" && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Runs at 08:00 UTC. New words wait in the review queue; dates without a year are
                      assumed to be this year.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => exportMutation.mutate()}
                    disabled={exportMutation.isPending}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {exportMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Upload className="w-3.5 h-3.5" />}
                    Export library to Drive
                  </button>
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    <Unlink className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sync progress — sits just beneath the Drive card. Determinate once
          the "analysing chunk/total" events start; indeterminate shimmer while
          connecting/reading; the full bar turns destructive on error. */}
      <AnimatePresence>
        {(syncing || syncError) && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            className="px-1"
          >
            <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
              <span className={cn("truncate", syncError ? "text-destructive font-semibold" : "text-muted-foreground")}>
                {syncError || syncStatus || "Syncing…"}
              </span>
              {!syncError && syncProgress && (
                <span className="flex-shrink-0 font-mono text-muted-foreground tabular-nums">
                  {syncProgress.chunk} / {syncProgress.total}
                </span>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              {syncError ? (
                <div className="h-full w-full bg-destructive/60" />
              ) : syncProgress ? (
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((syncProgress.chunk / Math.max(1, syncProgress.total)) * 100)}%` }}
                />
              ) : (
                <motion.div
                  className="h-full w-1/3 bg-primary rounded-full"
                  animate={reduceMotion ? undefined : { x: ["-100%", "400%"] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Year picker dialog */}
      <Dialog open={showYearPicker} onOpenChange={(open) => { if (!open) setShowYearPicker(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Which year are these dates from?</DialogTitle>
            <DialogDescription>
              Some dates in your document don't include a year:
              <span className="block mt-1 font-medium text-foreground">
                {ambiguousDates.slice(0, 5).join(", ")}{ambiguousDates.length > 5 ? ` +${ambiguousDates.length - 5} more` : ""}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleYearConfirm}>
                Use {selectedYear}
              </Button>
              <Button variant="outline" onClick={handleYearSkip}>
                Use today's year
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pending imports review modal — two-level group UI */}
      <Dialog open={showQueue} onOpenChange={setShowQueue}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review New Words from Google Doc</DialogTitle>
            <DialogDescription>
              Words grouped by date, newest first. Accept or skip entire groups, or expand a group to review individual words.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
            {pendingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : sortedGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No pending words to review.
              </p>
            ) : (
              sortedGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.dateKey);
                const labelList = Array.from(group.labels);
                return (
                  <div
                    key={group.dateKey}
                    className="rounded-lg card-float bg-card overflow-hidden"
                  >
                    {/* Group header row */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
                      {/* Expand toggle */}
                      <button
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => toggleGroupExpand(group.dateKey)}
                        aria-label={isExpanded ? "Collapse group" : "Expand group"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      {/* Date + labels + count */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">
                            {formatDateKey(group.dateKey)}
                          </span>
                          {labelList.map((label) => (
                            <span
                              key={label}
                              className="text-xs text-blue-700/80 bg-blue-500/10 px-2 py-0.5 rounded-full"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {group.items.length} word{group.items.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      {/* Group-level action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => acceptGroupMutation.mutate({ dateKey: group.dateKey })}
                          disabled={acceptGroupMutation.isPending || skipGroupMutation.isPending}
                          title="Accept all words in this group"
                        >
                          <CheckCheck className="w-3 h-3" />
                          Add all
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => skipGroupMutation.mutate({ dateKey: group.dateKey })}
                          disabled={acceptGroupMutation.isPending || skipGroupMutation.isPending}
                          title="Skip all words in this group"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Per-word list (expanded) */}
                    {isExpanded && (
                      <div className="divide-y divide-border/50">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.term}</p>
                              <p className="text-xs text-muted-foreground truncate">{item.translation}</p>
                              {item.groupLabel && (
                                <p className="text-xs text-blue-700/70 truncate mt-0.5">🏷 {item.groupLabel}</p>
                              )}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-700 hover:text-green-600 hover:bg-green-500/10"
                                onClick={() => acceptMutation.mutate({ id: item.id })}
                                disabled={acceptMutation.isPending}
                                title="Add this word"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => skipMutation.mutate({ id: item.id })}
                                disabled={skipMutation.isPending}
                                title="Skip this word"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {pendingImports.length > 0 && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                className="flex-1 gap-2"
                onClick={() => acceptAllMutation.mutate()}
                disabled={acceptAllMutation.isPending}
              >
                {acceptAllMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4" />
                )}
                Add All ({pendingImports.length})
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowQueue(false)}
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
