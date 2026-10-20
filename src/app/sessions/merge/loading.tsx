import { Skeleton } from "@/components/ui/skeleton";

export default function SessionMergeLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
      </div>
      {/* Facts */}
      <Skeleton className="h-36 w-full rounded-xl" />
      {/* Two columns */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-3 rounded-xl border border-border p-3">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[2/3] w-full rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Merge bar */}
      <Skeleton className="h-14 w-full rounded-t-2xl" />
    </div>
  );
}
