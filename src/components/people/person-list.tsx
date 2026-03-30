"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Users, Loader2, CheckSquare } from "lucide-react";
import { PersonCard } from "./person-card";
import { useDensity } from "@/components/layout/density-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadMorePersons } from "@/lib/actions/person-actions";
import type { PersonWithCommonAlias } from "@/lib/types";
import { getQuickPlausibilityCount } from "@/lib/services/plausibility-service";
import type { PersonFilters } from "@/lib/services/person-service";
import {
  saveBrowseContext,
  loadBrowseContext,
  updateBrowseScrollY,
  truncateName,
  filtersMatch,
} from "@/lib/browse-context";
import { useBulkSelection } from "@/hooks/use-bulk-selection";
import { BulkSelectionBar } from "@/components/shared/bulk-selection-bar";

type PhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type PersonListProps = {
  persons: PersonWithCommonAlias[];
  photoMap: Record<string, PhotoData>;
  nextCursor: string | null;
  totalCount: number;
  filters: PersonFilters;
  slot?: number;
};

/** Extract serializable filter params (string values only) for browse context comparison */
function filtersToRecord(filters: PersonFilters): Record<string, string> {
  const result: Record<string, string> = {};
  if (filters.q) result.q = filters.q;
  if (filters.status) result.status = filters.status;
  if (filters.naturalHairColor) result.hairColor = filters.naturalHairColor;
  if (filters.bodyType) result.bodyType = filters.bodyType;
  if (filters.ethnicity) result.ethnicity = filters.ethnicity;
  if (filters.sort) result.sort = filters.sort;
  if (filters.completeness) result.completeness = filters.completeness;
  if (filters.bodyRegions?.length) result.bodyRegions = filters.bodyRegions.join(",");
  if (filters.bodyRegionMatch) result.bodyRegionMatch = filters.bodyRegionMatch;
  return result;
}

export function PersonList({
  persons: initialPersons,
  photoMap: initialPhotoMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
  slot,
}: PersonListProps) {
  const { density } = useDensity();
  const isCompact = density === "compact";
  const [persons, setPersons] = useState(initialPersons);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const hasRestoredScroll = useRef(false);
  const bulk = useBulkSelection();

  useEffect(() => { setPersons(initialPersons); }, [initialPersons]);
  useEffect(() => { setPhotoMap(initialPhotoMap); }, [initialPhotoMap]);
  useEffect(() => { setCursor(initialCursor); }, [initialCursor]);

  // On mount: restore scroll position if returning from detail page with matching filters
  useEffect(() => {
    if (hasRestoredScroll.current) return;
    hasRestoredScroll.current = true;

    const ctx = loadBrowseContext();
    if (!ctx) return;

    const currentFilters = filtersToRecord(filters);
    if (!filtersMatch(currentFilters, ctx.filters)) {
      // Filters changed — context is stale
      return;
    }

    if (ctx.scrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo(0, ctx.scrollY);
      });
    }
  }, [filters]);

  // Build and save browse context whenever person list or cursor changes
  const saveBrowseContextFromState = useCallback(
    (currentPersons: PersonWithCommonAlias[], currentCursor: string | null) => {
      const ids = currentPersons.map((p) => p.id);
      const names = currentPersons.map((p) =>
        truncateName(p.commonAlias ?? p.icgId),
      );
      saveBrowseContext({
        ids,
        names,
        nextCursor: currentCursor,
        totalCount,
        filters: filtersToRecord(filters),
        slot,
        scrollY: 0, // will be updated on card click
      });
    },
    [totalCount, filters, slot],
  );

  // Save context when persons change — but skip on initial mount if stored context
  // has matching filters with more items (protects context across off-route navigation)
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;

      const ctx = loadBrowseContext();
      const currentFilters = filtersToRecord(filters);

      if (ctx && filtersMatch(currentFilters, ctx.filters) && ctx.ids.length >= persons.length) {
        // Returning with same filters — stored context has >= items, don't overwrite
        return;
      }
    }

    // Either: load-more happened, or first load with new/no context → save
    saveBrowseContextFromState(persons, cursor);
  }, [persons, cursor, saveBrowseContextFromState, filters]);

  function handleCardClick() {
    updateBrowseScrollY(window.scrollY);
  }

  function handleLoadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const result = await loadMorePersons(filters, cursor, slot);
      setPersons((prev) => {
        const next = [...prev, ...result.items];
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

  if (persons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No people found.</p>
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
        {persons.map((person) => {
          const photo = photoMap[person.id];
          const isSelected = bulk.selectedIds.has(person.id);
          return (
            <div key={person.id} className="relative">
              {bulk.isSelecting && (
                <button
                  type="button"
                  onClick={() => bulk.toggle(person.id)}
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
                <PersonCard
                  person={person}
                  photoUrl={photo?.url}
                  focalX={photo?.focalX}
                  focalY={photo?.focalY}
                  plausibilityCount={getQuickPlausibilityCount(person)}
                  onClick={bulk.isSelecting ? () => bulk.toggle(person.id) : handleCardClick}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more footer */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Showing {persons.length} of {totalCount}{" "}
          {totalCount === 1 ? "person" : "people"}
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
          entityType="PERSON"
          scope="PERSON"
          onClear={bulk.clear}
          totalCount={totalCount}
          onSelectAll={() => bulk.selectAll(persons.map((p) => p.id))}
        />
      )}
    </div>
  );
}
