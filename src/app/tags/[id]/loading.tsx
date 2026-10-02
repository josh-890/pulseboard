export default function TagDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading tag">
      <div className="h-4 w-16 animate-pulse rounded bg-muted/50" />
      <div className="h-32 animate-pulse rounded-2xl bg-muted/30" />
      <div className="flex gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-muted/30" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
