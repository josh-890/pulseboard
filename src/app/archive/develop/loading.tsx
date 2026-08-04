export default function DevelopLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted/40" />
        <div className="mt-2 h-4 w-full max-w-2xl animate-pulse rounded bg-muted/30" />
        <div className="mt-1.5 h-4 w-1/2 max-w-md animate-pulse rounded bg-muted/30" />
        <div className="mt-3 h-5 w-56 animate-pulse rounded bg-muted/40" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        {/* Person list */}
        <div className="space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>

        <div className="space-y-3">
          <div className="h-9 animate-pulse rounded-md bg-muted/40" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-md border border-border/60">
                <div className="aspect-[3/4] animate-pulse bg-muted/40" />
                <div className="space-y-1.5 p-2">
                  <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
                  <div className="h-5 w-14 animate-pulse rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
