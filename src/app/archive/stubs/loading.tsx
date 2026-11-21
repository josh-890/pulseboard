export default function ArchiveStubsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
        <div className="mt-2 h-8 w-32 animate-pulse rounded-lg bg-muted/40" />
        <div className="mt-2 h-4 w-full max-w-2xl animate-pulse rounded bg-muted/30" />
      </div>
      <div className="h-7 w-64 animate-pulse rounded-full bg-muted/40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded bg-muted/40" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted/30" />
            </div>
            <div className="h-5 w-14 animate-pulse rounded-full bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  )
}
