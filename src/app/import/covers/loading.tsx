export default function ImportCoversLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4">
      {/* Header skeleton */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="h-5 w-5 animate-pulse rounded bg-muted" />
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-1.5">
          <div className="h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="h-3 w-56 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Person search skeleton */}
      <div className="h-9 w-72 animate-pulse rounded-md bg-muted" />

      {/* Two panel skeletons */}
      <div className="flex min-h-0 flex-1 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-1 flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-4"
          >
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            <div className="h-20 animate-pulse rounded-lg border-2 border-dashed border-border/30 bg-muted/20" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3 rounded-lg border border-border/30 px-3 py-2">
                <div className="h-12 w-9 animate-pulse rounded bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
