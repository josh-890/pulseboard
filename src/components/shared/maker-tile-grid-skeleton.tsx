import { Skeleton } from "@/components/ui/skeleton";

/** Loading state of a channel, label or artist list: tiles with a mark, three covers and a line */
export function MakerTileGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm">
          <Skeleton className="h-6 w-40" />
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="aspect-[2/3] rounded-md" />
            ))}
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}
