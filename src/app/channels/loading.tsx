import { Skeleton } from "@/components/ui/skeleton";
import { MakerTileGridSkeleton } from "@/components/shared/maker-tile-grid-skeleton";

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
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-full sm:max-w-xs rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Tiles */}
      <MakerTileGridSkeleton />
    </div>
  );
}
