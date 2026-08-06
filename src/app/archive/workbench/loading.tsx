export default function WorkbenchLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-4 border-b border-border/60 px-3 py-2">
        <div className="h-4 w-16 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-28 animate-pulse rounded bg-muted/30" />
        <div className="h-1 w-24 animate-pulse rounded-full bg-muted/40" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col p-4">
          {/* The cover frame, with the identity overlay in its top corners. */}
          <div className="relative min-h-0 w-full flex-1 animate-pulse rounded bg-muted/40">
            <div className="absolute left-0 top-0 h-8 w-64 rounded-md bg-muted/60" />
            <div className="absolute right-0 top-0 h-24 w-40 rounded-md bg-muted/60" />
          </div>
        </div>
        <div className="w-72 shrink-0 space-y-3 border-l border-border/60 p-3">
          <div className="flex gap-3">
            <div className="h-[195px] w-[130px] animate-pulse rounded bg-muted/40" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted/30" />
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-muted/30" />
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
