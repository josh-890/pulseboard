import { Skeleton } from "@/components/ui/skeleton";

export default function FavoritesLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="mt-1 h-4 w-36" />
          </div>
        </div>
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>

      {/* Justified gallery rows */}
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-40 flex-1 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
