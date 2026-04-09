import { Skeleton } from "@/components/ui/skeleton";

export default function ArtistDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Skeleton className="h-8 w-20 rounded-md" />

      {/* Header card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-1 h-4 w-24" />
            <Skeleton className="mt-3 h-4 w-full max-w-md" />
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="mt-1 h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Career section */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md">
        <Skeleton className="mb-4 h-6 w-24" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-2 h-4 w-32" />
              <div className="space-y-1">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
