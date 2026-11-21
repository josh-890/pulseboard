export default function ComposeLoading() {
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <div className="flex items-center gap-4 border-b border-border/60 px-3 py-2">
        <div className="h-4 w-12 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-14 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-[35vh] flex-1 animate-pulse bg-black/60" />
        <div className="space-y-3 border-t border-border/60 p-3 lg:w-[30rem] lg:border-l lg:border-t-0">
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-[3.25rem] animate-pulse rounded-lg bg-muted/30" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 border-t border-border/60 px-3 py-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-16 w-10 shrink-0 animate-pulse rounded bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
