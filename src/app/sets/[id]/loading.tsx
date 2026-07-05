import { Skeleton } from "@/components/ui/skeleton";

export default function SetDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Nav row */}
      <div className="grid grid-cols-3 items-center gap-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mx-auto h-8 w-40 rounded-full" />
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex flex-col gap-5 sm:flex-row">
          <Skeleton className="mx-auto h-[250px] w-[180px] shrink-0 rounded-xl sm:mx-0" />
          <div className="flex-1 space-y-3">
            {/* Title + rating */}
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-24" />
            </div>
            {/* Metadata line */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="my-3 border-t border-white/10" />
            {/* Cast rail */}
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex w-[100px] flex-col items-center gap-2 rounded-xl border border-white/15 bg-card/80 p-2 shadow-sm">
                  <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
                  <div className="w-full space-y-1.5">
                    <Skeleton className="mx-auto h-3.5 w-4/5" />
                    <Skeleton className="mx-auto h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
            <div className="my-3 border-t border-white/10" />
            {/* Info line */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: gallery */}
        <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
          <Skeleton className="mb-4 h-5 w-20" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>

        {/* Right: credits + tags */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/40 p-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
