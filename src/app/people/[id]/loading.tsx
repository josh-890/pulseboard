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

      {/* Compact Reference Media strip */}
      <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-card/50 px-4 py-2.5">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-6 rounded-full" />
        <div className="flex gap-1 ml-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-md" />
          ))}
        </div>
      </div>

      {/* Hero card: 4-zone — Photo | Identity | Physical Stats | KPI */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Zone 1: Photo */}
          <Skeleton className="h-[220px] w-[180px] shrink-0 rounded-2xl" />

          {/* Zone 2: Identity + Basic Info */}
          <div className="w-full space-y-2.5 sm:w-44 sm:shrink-0">
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
            {/* Inline basic info (birthdate + ethnicity) */}
            <div className="flex gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            {/* Entity pills */}
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>

          {/* Zone 3: Physical Stats */}
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3.5 w-24 mb-1" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-24 shrink-0" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>

          {/* Zone 4: KPI Panel */}
          <div className="w-full sm:w-52 sm:shrink-0 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar with icon placeholders */}
      <div className="flex gap-1 rounded-xl border border-white/15 bg-card/50 p-1">
        {["Overview", "Aliases", "Appearance", "Details", "Skills", "Career", "Network", "Photos"].map((tab) => (
          <div key={tab} className="flex items-center gap-1.5 px-4 py-2">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        ))}
      </div>

      {/* Overview tab content: About + Recent Work/Photos + Ratings */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* About card (full width) */}
        <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm md:col-span-2 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Recent Work */}
        <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm space-y-3">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Photos */}
        <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-16 rounded-lg" />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
