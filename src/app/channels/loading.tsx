import { Skeleton } from "@/components/ui/skeleton";

export default function ChannelsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="mt-1 h-4 w-20" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-full sm:max-w-xs rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
          >
            <div className="mb-2.5 flex items-start gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-28 flex-1 mt-0.5" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
