import { Skeleton } from "@/components/ui/skeleton";

export default function PeopleLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="mt-1 h-4 w-16" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Skeleton className="h-9 w-full rounded-md sm:max-w-xs" />
        <Skeleton className="h-8 w-28 rounded-md" />
        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
      </div>

      {/* Starred strip skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[72px]">
              <Skeleton className="w-full rounded-xl" style={{ aspectRatio: "2/3" }} />
              <Skeleton className="mt-1 h-3 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Section label + select */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      {/* Poster grid */}
      <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-white/15 bg-card/70 shadow-md">
            <Skeleton className="w-full rounded-none" style={{ aspectRatio: "2/3" }} />
            <div className="px-2 pt-1.5 pb-3 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-10 rounded-full" />
              </div>
              <Skeleton className="h-2.5 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
