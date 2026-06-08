/**
 * GoogleDrivePanel
 *
 * Shows in the My Library tab:
 * - Connect / disconnect Google account
 * - Source doc URL input + Sync Now button (with SSE streaming progress)
 * - Year-picker dialog when dates lack a year
 * - Export library to Google Drive button
 * - Pending imports review queue with groupLabel sub-labels
 */
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getGoogleLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Upload, Unlink, Check, X, CheckCheck } from "lucide-react";

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

export function GoogleDrivePanel() {
  const utils = trpc.useUtils();
  const [docUrl, setDocUrl] = useState("");
  const [showQueue, setShowQueue] = useState(false);

  // SSE sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncError, setSyncError] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);

  // Year picker state
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [ambiguousDates, setAmbiguousDates] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  const { data: status, isLoading: statusLoading } = trpc.google.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

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
      toast.success(`Added ${data.added} word${data.added === 1 ? "" : "s"} to your library`);
      utils.google.getPendingImports.invalidate();
      utils.google.status.invalidate();
      utils.vocab.list.invalidate();
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

  // ── SSE sync ────────────────────────────────────────────────────────────────
  const startSyncStream = useCallback((url: string) => {
    if (esRef.current) {
      esRef.current.close();
    }
    setSyncing(true);
    setSyncError("");
    setSyncStatus("Connecting…");

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: SyncStep = JSON.parse(e.data);
        setSyncStatus(stepToMessage(event));

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
    // Re-run with current year as default
    startSyncStream(`/api/google/sync-stream?year=${new Date().getFullYear()}`);
  }, [startSyncStream]);

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

  // Group pending imports by dateKey + groupLabel for display
  const groupedImports: Array<{
    dateKey: string;
    groupLabel: string | null;
    items: typeof pendingImports;
  }> = [];
  const seen = new Map<string, typeof groupedImports[0]>();
  for (const item of pendingImports) {
    const key = `${item.dateKey}||${item.groupLabel ?? ""}`;
    if (!seen.has(key)) {
      const group = { dateKey: item.dateKey, groupLabel: item.groupLabel ?? null, items: [] as typeof pendingImports };
      seen.set(key, group);
      groupedImports.push(group);
    }
    seen.get(key)!.items.push(item);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Google Drive icon */}
              <svg width="20" height="20" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
              <CardTitle className="text-base">Google Drive Sync</CardTitle>
            </div>
            {pendingCount > 0 && (
              <Badge
                variant="default"
                className="cursor-pointer bg-primary text-primary-foreground"
                onClick={() => setShowQueue(true)}
              >
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            {status?.connected
              ? `Connected as ${status.email}`
              : "Connect your Google account to sync vocabulary from a Google Doc"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {!status?.connected ? (
            <a
              href={getGoogleLoginUrl()}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-lg transition-all duration-200 shadow-sm border border-gray-200 text-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google Account
            </a>
          ) : (
            <>
              {/* Source doc URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Source Google Doc URL
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://docs.google.com/document/d/..."
                    value={docUrl || status.sourceDocUrl || ""}
                    onChange={(e) => setDocUrl(e.target.value)}
                    className="text-xs h-8"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 shrink-0"
                    onClick={() => {
                      const url = docUrl || status.sourceDocUrl || "";
                      if (url) saveSettingsMutation.mutate({ sourceDocUrl: url });
                    }}
                    disabled={saveSettingsMutation.isPending}
                  >
                    {saveSettingsMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste the URL of a Google Doc containing French vocabulary notes
                </p>
              </div>

              {/* Live sync status */}
              {(syncing || syncStatus) && (
                <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${
                  syncError
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {syncing && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                  <span>{syncError || syncStatus}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={handleSyncNow}
                  disabled={syncing || !status.sourceDocUrl}
                >
                  {syncing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Sync Now
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  Export Library
                </Button>

                {pendingCount > 0 && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => setShowQueue(true)}
                  >
                    <CheckCheck className="w-3 h-3" />
                    Review {pendingCount} new word{pendingCount === 1 ? "" : "s"}
                  </Button>
                )}
              </div>

              {/* Last synced */}
              {status.lastSyncedAt && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
                </p>
              )}

              {/* Disconnect */}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1.5 px-2"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="w-3 h-3" />
                Disconnect Google
              </Button>
            </>
          )}
        </CardContent>
      </Card>

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

      {/* Pending imports review modal */}
      <Dialog open={showQueue} onOpenChange={setShowQueue}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review New Words from Google Doc</DialogTitle>
            <DialogDescription>
              These words were found in your Google Doc, grouped by date and topic. Accept the ones you want to add to your library.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            {pendingLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : groupedImports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No pending words to review.
              </p>
            ) : (
              groupedImports.map((group) => (
                <div key={`${group.dateKey}||${group.groupLabel}`}>
                  {/* Date header */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-foreground">{group.dateKey}</span>
                    {group.groupLabel && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {group.groupLabel}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 pl-2 border-l-2 border-border">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-card"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.term}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.translation}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                            onClick={() => acceptMutation.mutate({ id: item.id })}
                            disabled={acceptMutation.isPending}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => skipMutation.mutate({ id: item.id })}
                            disabled={skipMutation.isPending}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
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
