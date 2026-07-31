/**
 * Shown when no video lessons have been ingested yet. Split out so VideoReader
 * stays focused on the reader itself.
 */
export function EmptyVideoState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center rounded-2xl border border-border bg-card px-6 py-10">
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
          <span className="text-3xl" aria-hidden="true">🎬</span>
        </div>
        <p className="text-lg font-semibold text-foreground mb-1.5">No video lessons yet</p>
        <p className="text-sm text-muted-foreground">
          Add one from your machine with{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
            railway run -- pnpm tsx scripts/ingest-video.ts &lt;url&gt;
          </code>
        </p>
      </div>
    </div>
  );
}
