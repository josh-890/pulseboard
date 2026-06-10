export default function WatchlistLoading() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-muted/60" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
