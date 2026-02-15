import { Skeleton } from "@/components/ui/skeleton";

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
      <div className="mb-3 flex items-start justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mb-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-18 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}
