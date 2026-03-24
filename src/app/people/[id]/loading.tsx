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

      {/* Hero card: 4-zone — Photo | Identity | Physical Stats | KPI */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* Zone 1: Photo */}
          <Skeleton className="h-[220px] w-[180px] shrink-0 rounded-2xl" />

          {/* Zones 2+3: Identity | Physical — 2-col grid */}
          <div className="hidden sm:grid flex-1 min-w-0 grid-cols-[auto_1fr] grid-rows-[auto_1fr] items-start">
            {/* Row 1: Name area */}
            <div className="pb-3 space-y-2.5 w-44">
              <Skeleton className="h-6 w-36" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
            </div>
            {/* Rows 1-2: Physical stats (single continuous panel) */}
            <div className="row-span-2 rounded-lg bg-white/[0.02] px-4 py-2 ml-4 border-l border-white/8 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            {/* Row 2: Aliases + demographics */}
            <div className="pt-3 space-y-2">
              <div className="min-h-[3.25rem] space-y-1">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-28" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-2 rounded-full" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="flex items-center gap-1">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-0.5 w-24" />
                <Skeleton className="h-3 w-3" />
              </div>
            </div>
          </div>
          {/* Mobile fallback skeleton */}
          <div className="sm:hidden w-full space-y-2.5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-20" />
            <div className="rounded-lg bg-white/[0.02] px-4 py-1 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-24 shrink-0" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>

          {/* Divider 3|4 */}
          <div className="hidden sm:block w-px self-stretch bg-white/10 [mask-image:linear-gradient(to_bottom,transparent,white_20%,white_80%,transparent)]" />

          {/* Zone 4: KPI Panel — compact list */}
          <div className="w-full sm:w-52 sm:shrink-0 px-2 space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
            <div className="border-t border-white/10 my-2" />
            {/* PGRADE gauge skeleton */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-4" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-md" />
            </div>
            {/* CP gauge skeleton */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-4" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-md" />
            </div>
            {/* Star rating skeleton */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-4" />
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-4 rounded" />
                ))}
              </div>
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
