export default function ImportWorkspaceLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header skeleton */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
          <div className="space-y-1.5">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="shrink-0 border-b border-border/50 px-4 py-2">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-7 w-20 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      </div>

      {/* Split panel skeleton */}
      <div className="flex min-h-0 flex-1">
        <div className="w-80 shrink-0 border-r border-border/50 lg:w-96">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border-b border-border/30 px-3 py-3"
            >
              <div className="flex-1 space-y-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
