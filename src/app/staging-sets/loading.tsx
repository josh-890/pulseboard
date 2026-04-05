export default function StagingSetsLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header skeleton */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="space-y-1.5">
            <div className="h-6 w-36 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        ))}
      </div>

      {/* Split panel skeleton */}
      <div className="flex min-h-0 flex-1">
        <div className="w-80 shrink-0 border-r border-border/50 lg:w-96">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-border/30 px-3 py-2.5">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-1.5 h-4 w-48 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  )
}
