export default function ScanningSettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-muted/60" />
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-40 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
