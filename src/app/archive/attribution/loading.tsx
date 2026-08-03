export default function AttributionLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header: title + blurb */}
      <div className="mb-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted/40" />
        <div className="mt-2 h-4 w-full max-w-2xl animate-pulse rounded bg-muted/30" />
        <div className="mt-1.5 h-4 w-2/3 max-w-xl animate-pulse rounded bg-muted/30" />

        {/* Five stat tiles */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
              <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
              <div className="mt-1.5 h-6 w-12 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div className="mt-4 flex gap-1">
          {[52, 116, 68].map((w, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-muted/40" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Group rows */}
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-3">
            <div className="h-4 w-4 animate-pulse rounded bg-muted/30" />
            <div className="h-5 w-12 animate-pulse rounded bg-muted/40" />
            <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted/30" />
            <div className="ml-auto flex gap-1.5">
              <div className="h-6 w-24 animate-pulse rounded-full bg-muted/30" />
              <div className="h-7 w-20 animate-pulse rounded-md bg-muted/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
