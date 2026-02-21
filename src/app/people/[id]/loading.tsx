import { Skeleton } from "@/components/ui/skeleton";

export default function PersonDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Hero card: 5-zone — Photo | Identity | Basic Info | Physical Stats | KPI */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Zone 1: Photo */}
          <Skeleton className="h-[220px] w-[180px] shrink-0 rounded-2xl" />

          {/* Zone 2: Identity */}
          <div className="w-full space-y-2.5 sm:w-40 sm:shrink-0">
            <Skeleton className="h-6 w-36" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-4 w-2 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-4" />
              ))}
            </div>
          </div>

          {/* Zone 3: Basic Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-20 mb-1" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>

          {/* Zone 4: Physical Stats */}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-24 mb-1" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>

          {/* Zone 5: KPI Panel */}
          <div className="w-full sm:w-52 sm:shrink-0 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-2.5 w-full rounded-md" />
          </div>
        </div>
      </div>

      {/* Tab bar — 5 tabs */}
      <div className="flex gap-1 rounded-xl border border-white/15 bg-card/50 p-1">
        {["Overview", "Appearance", "Career", "Network", "Photos"].map((tab) => (
          <Skeleton key={tab} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Overview tab content: 2-col grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
