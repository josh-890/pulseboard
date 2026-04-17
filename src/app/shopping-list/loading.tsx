export default function ShoppingListLoading() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted/60" />
      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md dark:border-white/10">
        <div className="mb-4 flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-muted/60" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  )
}
