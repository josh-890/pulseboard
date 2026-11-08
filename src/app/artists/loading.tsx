import { Skeleton } from "@/components/ui/skeleton";
import { MakerTileGridSkeleton } from "@/components/shared/maker-tile-grid-skeleton";

export default function ArtistsLoading() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="mt-1 h-4 w-16" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      {/* Search */}
      <Skeleton className="h-9 w-full sm:max-w-xs rounded-md" />

      {/* Tiles */}
      <MakerTileGridSkeleton />
    </div>
  );
}
