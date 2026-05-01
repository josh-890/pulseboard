"use client";

import { useState, useTransition } from "react";
import { ImageIcon, Loader2, CheckSquare } from "lucide-react";
import { SetCard } from "./set-card";
import { useDensity } from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadMoreSets } from "@/lib/actions/set-actions";
import type { getSets } from "@/lib/services/set-service";
import type { SetFilters } from "@/lib/services/set-service";
import { useBulkSelection } from "@/hooks/use-bulk-selection";
import { BulkSelectionBar } from "@/components/shared/bulk-selection-bar";
import type { SuggestedFolderInfo } from "@/lib/services/archive-service";

type SetItem = Awaited<ReturnType<typeof getSets>>[number];

type CoverPhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type HeadshotData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type SetGridProps = {
  sets: SetItem[];
  photoMap: Record<string, CoverPhotoData>;
  headshotMap: Record<string, HeadshotData>;
  nextCursor: string | null;
  totalCount: number;
  filters: SetFilters;
  /** Keyed by set ID — only populated for the initial page load */
  suggestionsMap?: Record<string, SuggestedFolderInfo>;
  /** Keyed by set ID → partner set ID. Present only when duplicate filter is active. */
  duplicatePairMap?: Record<string, string>;
};

export function SetGrid({
  sets: initialSets,
  suggestionsMap = {},
  photoMap: initialPhotoMap,
  headshotMap: initialHeadshotMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
  duplicatePairMap,
}: SetGridProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const [sets, setSets] = useState(initialSets);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [headshotMap, setHeadshotMap] = useState(initialHeadshotMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const bulk = useBulkSelection();

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
      setHeadshotMap((prev) => ({ ...prev, ...result.headshotMap }));
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
      {/* Select mode toggle */}
      <div className="flex justify-end">
        <Button
          variant={bulk.isSelecting ? "default" : "outline"}
          size="sm"
          onClick={() => bulk.isSelecting ? bulk.exitSelection() : bulk.setSelecting(true)}
        >
          <CheckSquare size={14} className="mr-1.5" />
          {bulk.isSelecting ? "Cancel" : "Select"}
        </Button>
      </div>

      <div
        className={cn(
          "grid gap-4",
          isCompact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        )}
      >
        {sets.map((set) => {
          const isSelected = bulk.selectedIds.has(set.id);
          return (
            <div key={set.id} className="relative">
              {bulk.isSelecting && (
                <button
                  type="button"
                  onClick={() => bulk.toggle(set.id)}
                  className={cn(
                    "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-white/70 bg-black/30 backdrop-blur-sm",
                  )}
                >
                  {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
                </button>
              )}
              <div className={cn(bulk.isSelecting && isSelected && "ring-2 ring-primary rounded-xl")}>
                <SetCard
                  set={set}
                  coverPhoto={photoMap[set.id]}
                  headshotMap={headshotMap}
                  unresolvedCreditCount={set._count.creditsRaw}
                  suggestedArchiveFolder={suggestionsMap[set.id] ?? null}
                  isPotentialDuplicate={!!duplicatePairMap?.[set.id]}
                />
              </div>
            </div>
          );
        })}
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

      {/* Bulk selection bar */}
      {bulk.isSelecting && (
        <BulkSelectionBar
          selectedIds={bulk.selectedIds}
          entityType="SET"
          scope="SET"
          onClear={bulk.clear}
          totalCount={totalCount}
          onSelectAll={() => bulk.selectAll(sets.map((s) => s.id))}
        />
      )}
    </div>
  );
}
