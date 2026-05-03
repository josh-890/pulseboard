export default function SystemLoading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-24 rounded-lg bg-white/10" />
        <div className="h-4 w-64 rounded bg-white/5" />
      </div>
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 space-y-3">
        <div className="h-12 rounded-xl bg-white/5" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-white/10 bg-white/5" />
        ))}
      </div>
    </div>
  );
}
