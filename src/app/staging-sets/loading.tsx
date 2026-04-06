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

      {/* Tab bar skeleton */}
      <div className="flex items-center gap-4 border-b border-border/50 px-4 py-2">
        <div className="flex gap-1">
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="ml-auto h-8 w-20 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex flex-col gap-2 border-b border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-52 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
          <div className="ml-auto h-8 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Stripe list skeleton */}
      <div className="flex-1 p-4">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2">
              <div className="h-[80px] w-[56px] shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
