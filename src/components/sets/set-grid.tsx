"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ImageIcon, Loader2, CheckSquare, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { SetCard } from "./set-card";
import { useDensity } from "@/components/layout/density-provider";
import { useBrowserLayout } from "@/components/layout/browser-layout-provider";
import { getStarred, toggleStar } from "@/lib/browser-stars";
import { StarredItemsStrip } from "@/components/shared/starred-items-strip";
import { GroupHeader } from "@/components/shared/group-header";
import { cn } from "@/lib/utils";
import { computeAgeAtEvent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { loadMoreSets, dismissSetDuplicateAction } from "@/lib/actions/set-actions";
import { useRouter } from "next/navigation";
import type { getSets } from "@/lib/services/set-service";
import type { SetFilters } from "@/lib/services/set-service";
import { useBulkSelection } from "@/hooks/use-bulk-selection";
import { BulkSelectionBar } from "@/components/shared/bulk-selection-bar";
import type { SuggestedFolderInfo } from "@/lib/services/archive-service";
import {
  saveBrowseContext,
  loadBrowseContext,
  updateBrowseScrollY,
  truncateName,
  filtersMatch,
  SET_BROWSE_KEY,
} from "@/lib/browse-context";
import { computeGroups, buildNestedGroups, sortGroupKeys } from "@/lib/grouping";
import { useCollapseState } from "@/hooks/use-collapse-state";

type SetItem = Awaited<ReturnType<typeof getSets>>[number];

function filtersToRecord(filters: SetFilters): Record<string, string> {
  const r: Record<string, string> = {};
  if (filters.q) r.q = filters.q;
  if (filters.type && filters.type !== "all") r.type = filters.type;
  if (filters.channelId) r.channel = filters.channelId;
  if (filters.labelId) r.label = filters.labelId;
  if (filters.personId) r.personId = filters.personId;
  if (filters.sort) r.sort = filters.sort;
  if (filters.releaseDateFrom) r.releaseDateFrom = filters.releaseDateFrom.toISOString().split("T")[0];
  if (filters.releaseDateTo) r.releaseDateTo = filters.releaseDateTo.toISOString().split("T")[0];
  if (filters.createdFrom) r.createdFrom = filters.createdFrom.toISOString().split("T")[0];
  if (filters.createdTo) r.createdTo = filters.createdTo.toISOString().split("T")[0];
  return r;
}

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

type SetsGroupBy =
  | "none"
  | "year"
  | "channel"
  | "channel_year"
  | "label"
  | "youngest_age";

type SetGridProps = {
  sets: SetItem[];
  photoMap: Record<string, CoverPhotoData>;
  headshotMap: Record<string, HeadshotData>;
  nextCursor: string | null;
  totalCount: number;
  filters: SetFilters;
  groupBy?: string;
  /** Keyed by set ID — only populated for the initial page load */
  suggestionsMap?: Record<string, SuggestedFolderInfo>;
  /** Keyed by set ID → partner set ID. Present only when duplicate filter is active. */
  duplicatePairMap?: Record<string, string>;
};

function getSetGroupKey(set: SetItem, groupBy: SetsGroupBy): string {
  switch (groupBy) {
    case "year":
      return set.releaseDate ? String(new Date(set.releaseDate).getUTCFullYear()) : "Undated";

    case "channel":
      return set.channel?.name ?? "No Channel";

    case "label": {
      const labelName = set.channel?.labelMaps[0]?.label?.name;
      return labelName ?? "No Label";
    }

    case "youngest_age": {
      const ages: number[] = [];
      for (const p of set.participants) {
        if (!p.person.birthdate || !set.releaseDate) continue;
        const ageStr = computeAgeAtEvent(
          p.person.birthdate,
          p.person.birthdatePrecision ?? "DAY",
          set.releaseDate,
          set.releaseDatePrecision ?? "DAY",
        );
        const age = parseInt(ageStr.replace("~", ""));
        if (!isNaN(age)) ages.push(age);
      }
      if (ages.length === 0) return "Unknown";
      const min = Math.min(...ages);
      if (min < 20) return "Under 20";
      if (min < 25) return "20–25";
      if (min < 30) return "25–30";
      if (min < 35) return "30–35";
      return "35+";
    }

    default:
      return "";
  }
}

const YOUNGEST_AGE_ORDER = ["Under 20", "20–25", "25–30", "30–35", "35+", "Unknown"];

function getSortMode(groupBy: SetsGroupBy) {
  if (groupBy === "year") return "year" as const;
  if (groupBy === "youngest_age") return "alpha" as const;
  return "alpha" as const;
}

function sortYearKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === "Undated") return 1;
    if (b === "Undated") return -1;
    return parseInt(b) - parseInt(a);
  });
}

function sortYoungestAgeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = YOUNGEST_AGE_ORDER.indexOf(a);
    const bi = YOUNGEST_AGE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function hasActiveFilters(filters: SetFilters): boolean {
  return !!(
    filters.q ||
    (filters.type && filters.type !== "all") ||
    filters.channelId ||
    filters.labelId ||
    filters.personId ||
    filters.releaseDateFrom ||
    filters.releaseDateTo ||
    filters.createdFrom ||
    filters.createdTo
  );
}

export function SetGrid({
  sets: initialSets,
  suggestionsMap = {},
  photoMap: initialPhotoMap,
  headshotMap: initialHeadshotMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
  groupBy: groupByProp = "none",
  duplicatePairMap,
}: SetGridProps) {
  const groupBy = groupByProp as SetsGroupBy;
  const { density } = useDensity();
  const { setsLayout, setsCoverAspect } = useBrowserLayout();
  const isCompact = density === "compact";
  const isPoster = setsLayout === "poster";
  const [sets, setSets] = useState(initialSets);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [headshotMap, setHeadshotMap] = useState(initialHeadshotMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const hasRestoredScroll = useRef(false);
  const isInitialMount = useRef(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreFnRef = useRef<() => void>(() => {});
  const bulk = useBulkSelection();
  const { isCollapsed, toggle, collapseAll, expandAll, defaultCollapsed } = useCollapseState(
    "pulseboard-sets-groups",
    groupBy,
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    if (groupBy === "channel_year") {
      const nested = buildNestedGroups(
        sets,
        (s) => s.channel?.name ?? "No Channel",
        (s) => s.releaseDate ? String(new Date(s.releaseDate).getUTCFullYear()) : "Undated",
      );
      const sortedChannels = sortGroupKeys(nested.map((g) => g.key), "alpha");
      return sortedChannels.map((key) => {
        const outer = nested.find((g) => g.key === key)!;
        const sortedYears = sortYearKeys(outer.subGroups?.map((sg) => sg.label) ?? []);
        const sortedSubGroups = sortedYears
          .map((y) => (outer.subGroups ?? []).find((sg) => sg.label === y))
          .filter((sg): sg is NonNullable<typeof sg> => sg !== undefined);
        return { ...outer, subGroups: sortedSubGroups };
      }).filter(Boolean);
    }
    const raw = computeGroups(sets, (s) => getSetGroupKey(s, groupBy));
    const keys = raw.map((g) => g.key);
    const sortedKeys = groupBy === "year"
      ? sortYearKeys(keys)
      : groupBy === "youngest_age"
        ? sortYoungestAgeKeys(keys)
        : sortGroupKeys(keys, getSortMode(groupBy));
    return sortedKeys.map((key) => raw.find((g) => g.key === key)!).filter(Boolean);
  }, [sets, groupBy]);

  useEffect(() => { setSets(initialSets); }, [initialSets]);
  useEffect(() => { setPhotoMap(initialPhotoMap); }, [initialPhotoMap]);
  useEffect(() => { setHeadshotMap(initialHeadshotMap); }, [initialHeadshotMap]);
  useEffect(() => { setCursor(initialCursor); }, [initialCursor]);
  useEffect(() => { setStarredIds(getStarred("sets")); }, []);

  // Restore scroll on return from detail page
  useEffect(() => {
    if (hasRestoredScroll.current) return;
    hasRestoredScroll.current = true;
    const ctx = loadBrowseContext(SET_BROWSE_KEY);
    if (!ctx) return;
    if (!filtersMatch(filtersToRecord(filters), ctx.filters)) return;
    if (ctx.scrollY > 0) {
      requestAnimationFrame(() => { window.scrollTo(0, ctx.scrollY); });
    }
  }, [filters]);

  const saveBrowseContextFromState = useCallback(
    (current: SetItem[], cur: string | null) => {
      saveBrowseContext(
        {
          ids: current.map((s) => s.id),
          names: current.map((s) => truncateName(s.title)),
          nextCursor: cur,
          totalCount,
          filters: filtersToRecord(filters),
          scrollY: 0,
        },
        SET_BROWSE_KEY,
      );
    },
    [totalCount, filters],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const ctx = loadBrowseContext(SET_BROWSE_KEY);
      if (ctx && filtersMatch(filtersToRecord(filters), ctx.filters) && ctx.ids.length > sets.length) {
        return;
      }
    }
    saveBrowseContextFromState(sets, cursor);
  }, [sets, cursor, saveBrowseContextFromState, filters]);

  function handleCardClick() {
    updateBrowseScrollY(window.scrollY, SET_BROWSE_KEY);
  }

  function handleToggleStar(id: string) {
    toggleStar("sets", id);
    setStarredIds(getStarred("sets"));
  }

  const router = useRouter();
  function handleDismissDuplicate(setId: string, partnerId: string) {
    // Optimistic: drop both sets of the pair from the grid immediately so the click
    // has instant feedback; the server action + refresh reconcile (and self-correct
    // if it failed, since the refresh re-seeds from the server).
    setSets((prev) => prev.filter((s) => s.id !== setId && s.id !== partnerId));
    void dismissSetDuplicateAction(setId, partnerId).then(() => router.refresh());
  }

  const filtersActive = hasActiveFilters(filters);

  const starredItems = useMemo(
    () =>
      sets
        .filter((s) => starredIds.includes(s.id))
        .sort((a, b) => starredIds.indexOf(a.id) - starredIds.indexOf(b.id))
        .map((s) => ({
          id: s.id,
          href: `/sets/${s.id}`,
          photo: photoMap[s.id]
            ? { thumbUrl: photoMap[s.id].url, focalX: photoMap[s.id].focalX, focalY: photoMap[s.id].focalY }
            : undefined,
          label: s.title,
          sublabel: s.channel?.name,
        })),
    [sets, starredIds, photoMap],
  );

  const handleLoadMore = useCallback(() => {
    if (!cursor || isPending) return;
    startTransition(async () => {
      const result = await loadMoreSets(filters, cursor);
      setSets((prev) => {
        const next = [...prev, ...(result.items as SetItem[])];
        const url = new URL(window.location.href);
        url.searchParams.set("loaded", String(next.length));
        window.history.replaceState(null, "", url.toString());
        return next;
      });
      setPhotoMap((prev) => ({ ...prev, ...result.photoMap }));
      setHeadshotMap((prev) => ({ ...prev, ...result.headshotMap }));
      setCursor(result.nextCursor);
    });
  }, [cursor, isPending, filters]);

  // Keep ref in sync so the observer always calls the latest version
  useEffect(() => { loadMoreFnRef.current = handleLoadMore; });

  // Infinite scroll — recreate observer when cursor changes so it re-fires
  // if the sentinel is still in view after a batch loads
  useEffect(() => {
    if (!cursor) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreFnRef.current(); },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor]);

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

  const gridClass = cn(
    "grid",
    isPoster
      ? isCompact
        ? "gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        : "gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      : cn(
          "gap-4",
          isCompact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        ),
  );

  // ── Grouped render mode ──────────────────────────────────────────────────────
  if (groupBy !== "none" && groups) {
    return (
      <div className="space-y-4">
        {/* Collapse / expand all */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
            {groups.length} {groups.length === 1 ? "group" : "groups"} · {totalCount}{" "}
            {totalCount === 1 ? "set" : "sets"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={defaultCollapsed ? expandAll : collapseAll}
            className="h-7 gap-1.5 border-white/20 bg-card/50 text-xs text-muted-foreground hover:text-foreground"
          >
            {defaultCollapsed ? (
              <><ChevronsUpDown size={12} /> Expand all</>
            ) : (
              <><ChevronsDownUp size={12} /> Collapse all</>
            )}
          </Button>
        </div>

        {/* Grouped sections */}
        <div className="space-y-2">
          {groups.map((group) => {
            const collapsed = isCollapsed(group.key);
            // Channel → Year: nested groups
            if (groupBy === "channel_year" && group.subGroups) {
              return (
                <div key={group.key} className="space-y-2">
                  <GroupHeader
                    label={group.label}
                    count={group.items.length}
                    level={1}
                    collapsed={collapsed}
                    onToggle={() => toggle(group.key)}
                  />
                  {!collapsed && (
                    <div className="space-y-2 pl-4">
                      {group.subGroups.map((sub) => {
                        const subCollapsed = isCollapsed(sub.key);
                        return (
                          <div key={sub.key} className="space-y-2">
                            <GroupHeader
                              label={sub.label}
                              count={sub.items.length}
                              level={2}
                              collapsed={subCollapsed}
                              onToggle={() => toggle(sub.key)}
                            />
                            {!subCollapsed && (
                              <div className={gridClass}>
                                {sub.items.map((set) => (
                                  <SetCard
                                    key={set.id}
                                    set={set}
                                    coverPhoto={photoMap[set.id]}
                                    headshotMap={headshotMap}
                                    unresolvedCreditCount={set._count.creditsRaw}
                                    suggestedArchiveFolder={suggestionsMap[set.id] ?? null}
                                    isPotentialDuplicate={!!duplicatePairMap?.[set.id]}
                                    duplicatePartnerId={duplicatePairMap?.[set.id]}
                                    onDismissDuplicate={handleDismissDuplicate}
                                    isStarred={starredIds.includes(set.id)}
                                    onToggleStar={handleToggleStar}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            // Flat groups
            return (
              <div key={group.key} className="space-y-2">
                <GroupHeader
                  label={group.label}
                  count={group.items.length}
                  level={1}
                  collapsed={collapsed}
                  onToggle={() => toggle(group.key)}
                />
                {!collapsed && (
                  <div className={gridClass}>
                    {group.items.map((set) => (
                      <SetCard
                        key={set.id}
                        set={set}
                        coverPhoto={photoMap[set.id]}
                        headshotMap={headshotMap}
                        unresolvedCreditCount={set._count.creditsRaw}
                        suggestedArchiveFolder={suggestionsMap[set.id] ?? null}
                        isPotentialDuplicate={!!duplicatePairMap?.[set.id]}
                        duplicatePartnerId={duplicatePairMap?.[set.id]}
                        onDismissDuplicate={handleDismissDuplicate}
                        isStarred={starredIds.includes(set.id)}
                        onToggleStar={handleToggleStar}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Flat (ungrouped) render mode — existing behavior ─────────────────────────
  return (
    <div className="space-y-4">
      {/* Starred strip */}
      {!filtersActive && (
        <StarredItemsStrip
          items={starredItems}
          onUnstar={handleToggleStar}
          aspectRatio={setsCoverAspect === "portrait" ? "2/3" : "4/3"}
        />
      )}

      {/* Section label + select toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
          {filtersActive ? `Filtered (${totalCount})` : `All Sets (${totalCount})`}
        </p>
        <Button
          variant={bulk.isSelecting ? "default" : "outline"}
          size="sm"
          onClick={() => bulk.isSelecting ? bulk.exitSelection() : bulk.setSelecting(true)}
        >
          <CheckSquare size={14} className="mr-1.5" />
          {bulk.isSelecting ? "Cancel" : "Select"}
        </Button>
      </div>

      <div className={gridClass}>
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
              <div
                className={cn(bulk.isSelecting && isSelected && "ring-2 ring-primary rounded-xl")}
                onClick={bulk.isSelecting ? undefined : handleCardClick}
              >
                <SetCard
                  set={set}
                  coverPhoto={photoMap[set.id]}
                  headshotMap={headshotMap}
                  unresolvedCreditCount={set._count.creditsRaw}
                  suggestedArchiveFolder={suggestionsMap[set.id] ?? null}
                  isPotentialDuplicate={!!duplicatePairMap?.[set.id]}
                  duplicatePartnerId={duplicatePairMap?.[set.id]}
                  onDismissDuplicate={handleDismissDuplicate}
                  isStarred={starredIds.includes(set.id)}
                  onToggleStar={handleToggleStar}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Count + infinite scroll sentinel */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Showing {sets.length} of {totalCount}{" "}
          {totalCount === 1 ? "set" : "sets"}
        </p>
        {isPending && <Loader2 size={18} className="animate-spin text-muted-foreground/50" />}
      </div>
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />

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
