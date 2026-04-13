export default function ArchiveLoading() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-pulse rounded-full bg-muted/40" />
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted/30" />
      </div>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md dark:border-white/10">
        {/* Tab strip skeleton */}
        <div className="mb-4 flex gap-2">
          {[80, 68, 84, 90].map((w, i) => (
            <div
              key={i}
              className="h-7 animate-pulse rounded-full bg-muted/40"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* Filter bar skeleton */}
        <div className="mb-3 flex gap-2">
          {[48, 60, 60].map((w, i) => (
            <div
              key={i}
              className="h-6 animate-pulse rounded-full bg-muted/30"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* Row skeletons */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 px-4 py-3"
            >
              <div className="h-3.5 w-3.5 animate-pulse rounded-full bg-muted/40 shrink-0" />
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-muted/40 shrink-0" />
              <div className="h-3.5 w-28 animate-pulse rounded bg-muted/40 shrink-0" />
              <div className="h-3.5 w-12 animate-pulse rounded-full bg-muted/30 shrink-0" />
              <div className="h-3.5 flex-1 animate-pulse rounded bg-muted/40 min-w-0" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-muted/30 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
