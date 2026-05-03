export default function StorageLoading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-28 rounded-lg bg-white/10" />
        <div className="h-4 w-80 rounded bg-white/5" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-card/70 p-6 space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3.5 w-32 rounded bg-white/10" />
            <div className="h-9 w-full rounded-lg bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
