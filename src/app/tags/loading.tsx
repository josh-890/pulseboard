export default function TagsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading tags">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted/50" />
        <div className="space-y-2">
          <div className="h-6 w-24 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-36 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="flex gap-1">
        <div className="h-8 w-28 animate-pulse rounded-lg bg-muted/40" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted/30" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-9 w-full max-w-sm animate-pulse rounded-lg bg-muted/30" />
        {[40, 64, 80, 96].map((w) => (
          <div key={w} className="h-6 animate-pulse rounded-full bg-muted/30" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    </div>
  );
}
