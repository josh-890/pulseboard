import { Skeleton } from "@/components/ui/skeleton";

export function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
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
  );
}
