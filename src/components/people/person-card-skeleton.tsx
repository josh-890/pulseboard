import { Skeleton } from "@/components/ui/skeleton";

export function PersonCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="min-w-0">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-1 h-4 w-44" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}
