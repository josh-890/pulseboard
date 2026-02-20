"use client";

import { useState, useTransition } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { SetCard } from "./set-card";
import { useDensity } from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadMoreSets } from "@/lib/actions/set-actions";
import type { getSets } from "@/lib/services/set-service";
import type { SetFilters } from "@/lib/services/set-service";

type SetItem = Awaited<ReturnType<typeof getSets>>[number];

type SetGridProps = {
  sets: SetItem[];
  photoMap: Record<string, string>;
  nextCursor: string | null;
  totalCount: number;
  filters: SetFilters;
};

export function SetGrid({
  sets: initialSets,
  photoMap: initialPhotoMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
}: SetGridProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const [sets, setSets] = useState(initialSets);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  function handleLoadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const result = await loadMoreSets(filters, cursor);
      setSets((prev) => {
        const next = [...prev, ...(result.items as SetItem[])];
        // Silently update URL so back-navigation restores the loaded count
        const url = new URL(window.location.href);
        url.searchParams.set("loaded", String(next.length));
        window.history.replaceState(null, "", url.toString());
        return next;
      });
      setPhotoMap((prev) => ({ ...prev, ...result.photoMap }));
      setCursor(result.nextCursor);
    });
  }

  if (sets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No sets found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid gap-4",
          isCompact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
        )}
      >
        {sets.map((set) => (
          <SetCard key={set.id} set={set} photoUrl={photoMap[set.id]} />
        ))}
      </div>

      {/* Load more footer */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Showing {sets.length} of {totalCount}{" "}
          {totalCount === 1 ? "set" : "sets"}
        </p>
        {cursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Loading…
              </>
            ) : (
              "Load more (50)"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
