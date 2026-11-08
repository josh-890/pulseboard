import { Skeleton } from "@/components/ui/skeleton";

export default function ArtistDetailLoading() {
  return (
    <div className="space-y-5">
      {/* Back link + actions row */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </div>

      {/* Hero: wordmark, chips | rating + numbers */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-10 w-72 max-w-full" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          </div>
          <div className="flex items-end gap-6">
            <Skeleton className="h-9 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-16" />
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <Skeleton className="h-10 w-72 rounded-xl" />

      {/* Showcase mosaic: one big tile and the next ones beside it */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-64 rounded-md" />
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5">
          <Skeleton className="col-span-3 aspect-[4/5] rounded-xl md:col-span-2 md:row-span-2 md:aspect-auto" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={i < 3 ? "aspect-[4/5] rounded-xl" : i < 4 ? "hidden aspect-[4/5] rounded-xl md:block" : "hidden aspect-[4/5] rounded-xl lg:block"} />
          ))}
        </div>
      </div>

      {/* Known for posters */}
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-36 shrink-0 rounded-xl sm:w-40" />
        ))}
      </div>

      {/* Overview: About + Notes, Tags */}
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm">
            <Skeleton className="mb-3 h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
          </div>
        ))}
        <div className="rounded-2xl border border-white/20 bg-card/70 p-5 shadow-md backdrop-blur-sm md:col-span-2">
          <Skeleton className="mb-3 h-5 w-16" />
          <Skeleton className="h-6 w-48 rounded-full" />
        </div>
      </div>
    </div>
  );
}
