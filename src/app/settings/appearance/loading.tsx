export default function AppearanceLoading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 rounded-lg bg-white/10" />
        <div className="h-4 w-72 rounded bg-white/5" />
      </div>
      <div className="rounded-2xl border border-white/10 bg-card/70 p-6 space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3">
            {i > 0 && <div className="border-t border-border" />}
            <div className="h-3.5 w-24 rounded bg-white/10" />
            <div className="h-9 w-full rounded-lg bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
