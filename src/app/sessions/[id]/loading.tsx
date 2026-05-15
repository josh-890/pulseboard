import { Skeleton } from "@/components/ui/skeleton";

export default function SessionDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Nav row */}
      <div className="grid grid-cols-3 items-center gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mx-auto h-8 w-40 rounded-full" />
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-7 w-48" />
            <div className="mt-2 flex gap-2">
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <Skeleton className="mx-auto h-7 w-8" />
              <Skeleton className="mx-auto mt-1 h-3 w-16" />
            </div>
            <div className="text-center">
              <Skeleton className="mx-auto h-7 w-8" />
              <Skeleton className="mx-auto mt-1 h-3 w-10" />
            </div>
          </div>
        </div>
      </div>

      {/* About card */}
      <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm space-y-4">
        <div>
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="border-t border-white/10" />
        <div>
          <Skeleton className="h-3 w-20 mb-1" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: gallery + skills */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
            <Skeleton className="mb-4 h-5 w-24" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
            <Skeleton className="mb-4 h-5 w-36" />
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton className="h-3.5 w-3.5" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="ml-auto h-3 w-12" />
                  </div>
                  <div className="ml-6 mt-1 flex flex-wrap gap-1.5">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <Skeleton key={j} className="h-6 w-24 rounded-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: contributors + linked sets */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-card/70 p-6 shadow-md backdrop-blur-sm">
            <Skeleton className="mb-4 h-5 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-white/15 bg-card/40 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="mt-1 h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
