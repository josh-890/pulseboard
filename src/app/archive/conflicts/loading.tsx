export default function ConflictsLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-4 border-b border-border/60 px-3 py-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted/40" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col p-4">
          {/* The title sits centred directly above the cover. */}
          <div className="flex h-14 w-full max-w-3xl flex-col justify-end self-center pb-1">
            <div className="mx-auto h-4 w-72 animate-pulse rounded bg-muted/40" />
          </div>
          <div className="relative min-h-0 w-full flex-1 animate-pulse rounded bg-muted/40">
            <div className="absolute right-0 top-0 h-24 w-40 rounded-md bg-muted/60" />
          </div>
        </div>
        <div className="w-80 shrink-0 space-y-3 border-l border-border/60 p-3">
          <div className="h-[120px] w-20 animate-pulse rounded bg-muted/40" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-14 w-10 animate-pulse rounded bg-muted/30" />
          ))}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 border-t border-border/60 px-3 py-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="h-14 w-11 shrink-0 animate-pulse rounded bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
