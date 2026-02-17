import { Skeleton } from "@/components/ui/skeleton";

export function PersonCardSkeleton() {
  return (
    <div className="flex h-[136px] overflow-hidden rounded-xl border border-white/30 bg-card/70 shadow-lg backdrop-blur-md dark:border-white/10">
      <Skeleton className="h-full w-[100px] shrink-0 rounded-l-xl rounded-r-none" />
      <div className="flex flex-1 flex-col justify-center p-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1.5 h-4 w-44" />
        <Skeleton className="mt-1.5 h-4 w-36" />
      </div>
    </div>
  );
}
