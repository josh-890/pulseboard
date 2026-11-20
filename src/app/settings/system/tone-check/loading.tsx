export default function Loading() {
  return (
    <div className="max-w-5xl space-y-6" aria-busy="true">
      <div className="space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
      </div>
      <div className="h-12 animate-pulse rounded-xl bg-muted/60" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
