import { Skeleton } from "@/components/ui/skeleton";

export function ActivityFeedSkeleton() {
  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
      <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-2">
            <Skeleton className="mt-0.5 h-4 w-4 rounded" />
            <div className="flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
