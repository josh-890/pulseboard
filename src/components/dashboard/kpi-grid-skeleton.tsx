import { Skeleton } from "@/components/ui/skeleton";

export function KpiGridSkeleton() {
  return (
    <div className="space-y-2">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md dark:border-white/10"
        >
          <div className="flex items-start justify-between">
            <div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-8 w-16" />
            </div>
            <Skeleton className="h-5 w-5 rounded" />
          </div>
        </div>
      ))}
    </div>
      <Skeleton className="h-3 w-64" />
    </div>
  );
}
