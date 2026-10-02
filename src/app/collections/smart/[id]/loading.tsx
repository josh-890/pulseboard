export default function SmartCollectionLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading smart collection">
      <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-muted/50" />
        <div className="space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="h-8 w-full max-w-lg animate-pulse rounded-lg bg-muted/40" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
