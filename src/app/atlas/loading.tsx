import { Skeleton } from "@/components/ui/skeleton";

export default function AtlasLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="mt-1 h-4 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <Skeleton className="h-5 w-20" />
                <Skeleton className="mt-1 h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="aspect-[2/3] flex-1 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
