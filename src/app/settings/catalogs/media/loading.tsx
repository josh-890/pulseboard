export default function CatalogLoading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-white/10" />
        <div className="h-4 w-80 rounded bg-white/5" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl border border-white/10 bg-white/5" />
        ))}
      </div>
    </div>
  );
}
