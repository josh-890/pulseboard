"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Users, Loader2, CheckSquare, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { PersonCard } from "./person-card";
import { useDensity } from "@/components/layout/density-provider";
import { useBrowserLayout } from "@/components/layout/browser-layout-provider";
import { getStarred, toggleStar } from "@/lib/browser-stars";
import { StarredItemsStrip } from "@/components/shared/starred-items-strip";
import { GroupHeader } from "@/components/shared/group-header";
import { FlagImage } from "@/components/shared/flag-image";
import { cn } from "@/lib/utils";
import { computeAgeFromPartialDate, computeAgeAtEvent } from "@/lib/utils";
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
import { computeGroups, sortGroupKeys } from "@/lib/grouping";
import { useCollapseState } from "@/hooks/use-collapse-state";

type PhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

type PeopleGroupBy =
  | "none"
  | "nationality"
  | "career_decade"
  | "name_az"
  | "age_current"
  | "age_career_start";

type PersonListProps = {
  persons: PersonWithCommonAlias[];
  photoMap: Record<string, PhotoData>;
  nextCursor: string | null;
  totalCount: number;
  filters: PersonFilters;
  slot?: number;
  groupBy?: string;
};

function getPersonGroupKey(person: PersonWithCommonAlias, groupBy: PeopleGroupBy): string {
  switch (groupBy) {
    case "nationality":
      return person.nationality || "Unknown";

    case "career_decade": {
      if (!person.activeFrom) return "Unknown";
      const year = new Date(person.activeFrom).getUTCFullYear();
      const decade = Math.floor(year / 10) * 10;
      return `${decade}s`;
    }

    case "name_az": {
      const name = person.commonAlias ?? person.icgId ?? "";
      const first = name[0]?.toUpperCase() ?? "";
      return /^[A-Z]$/.test(first) ? first : "#";
    }

    case "age_current": {
      const ageStr = computeAgeFromPartialDate(person.birthdate, person.birthdatePrecision);
      if (ageStr === "Unknown") return "Unknown";
      const age = parseInt(ageStr.replace("~", ""));
      if (isNaN(age)) return "Unknown";
      if (age < 25) return "Under 25";
      if (age < 30) return "25–30";
      if (age < 35) return "30–35";
      if (age < 40) return "35–40";
      return "40+";
    }

    case "age_career_start": {
      if (!person.birthdate || !person.activeFrom) return "Unknown";
      const ageStr = computeAgeAtEvent(
        person.birthdate,
        person.birthdatePrecision,
        person.activeFrom,
        person.activeFromPrecision || "DAY",
      );
      if (ageStr === "Unknown") return "Unknown";
      const age = parseInt(ageStr.replace("~", ""));
      if (isNaN(age)) return "Unknown";
      if (age < 18) return "Under 18";
      if (age < 20) return "18–20";
      if (age < 25) return "20–25";
      if (age < 30) return "25–30";
      return "30+";
    }

    default:
      return "";
  }
}

function getSortMode(groupBy: PeopleGroupBy) {
  if (groupBy === "career_decade") return "decade" as const;
  if (groupBy === "age_current") return "age_bracket" as const;
  if (groupBy === "age_career_start") return "age_career" as const;
  return "alpha" as const;
}

function filtersToRecord(filters: PersonFilters, groupBy = "none"): Record<string, string> {
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
  if (groupBy !== "none") result.groupBy = groupBy;
  return result;
}

function hasActiveFilters(filters: PersonFilters): boolean {
  return !!(
    filters.q ||
    (filters.status && filters.status !== "all") ||
    filters.naturalHairColor ||
    filters.bodyType ||
    filters.ethnicity ||
    filters.completeness ||
    filters.bodyRegions?.length ||
    filters.birthdateFrom ||
    filters.birthdateTo ||
    filters.createdFrom ||
    filters.createdTo
  );
}

export function PersonList({
  persons: initialPersons,
  photoMap: initialPhotoMap,
  nextCursor: initialCursor,
  totalCount,
  filters,
  slot,
  groupBy: groupByProp = "none",
}: PersonListProps) {
  const groupBy = groupByProp as PeopleGroupBy;
  const { density } = useDensity();
  const { peopleLayout } = useBrowserLayout();
  const isCompact = density === "compact";
  const isPoster = peopleLayout === "poster";

  const [persons, setPersons] = useState(initialPersons);
  const [photoMap, setPhotoMap] = useState(initialPhotoMap);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const hasRestoredScroll = useRef(false);
  const isInitialMount = useRef(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreFnRef = useRef<() => void>(() => {});
  const bulk = useBulkSelection();
  const { isCollapsed, toggle, collapseAll, expandAll, defaultCollapsed } = useCollapseState(
    "pulseboard-people-groups",
    groupBy,
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const raw = computeGroups(persons, (p) => getPersonGroupKey(p, groupBy));
    if (groupBy === "nationality") {
      return raw.sort((a, b) => {
        if (a.key === "Unknown") return 1;
        if (b.key === "Unknown") return -1;
        return b.items.length - a.items.length;
      });
    }
    const sortedKeys = sortGroupKeys(raw.map((g) => g.key), getSortMode(groupBy));
    return sortedKeys.map((key) => raw.find((g) => g.key === key)!).filter(Boolean);
  }, [persons, groupBy]);

  // In grouped mode, flatten groups in visual order for correct browse context sequencing
  const orderedPersons = useMemo(() => {
    if (!groups || groupBy === "none") return persons;
    return groups.flatMap((g) => g.items);
  }, [groups, groupBy, persons]);

  useEffect(() => { setPersons(initialPersons); }, [initialPersons]);
  useEffect(() => { setPhotoMap(initialPhotoMap); }, [initialPhotoMap]);
  useEffect(() => { setCursor(initialCursor); }, [initialCursor]);
  useEffect(() => { setStarredIds(getStarred("people")); }, []);

  useEffect(() => {
    if (hasRestoredScroll.current) return;
    hasRestoredScroll.current = true;
    const ctx = loadBrowseContext();
    if (!ctx) return;
    if (!filtersMatch(filtersToRecord(filters, groupBy), ctx.filters)) return;
    if (ctx.scrollY > 0) {
      requestAnimationFrame(() => { window.scrollTo(0, ctx.scrollY); });
    }
  }, [filters, groupBy]);

  const saveBrowseContextFromState = useCallback(
    (currentPersons: PersonWithCommonAlias[], currentCursor: string | null) => {
      saveBrowseContext({
        ids: currentPersons.map((p) => p.id),
        names: currentPersons.map((p) => truncateName(p.commonAlias ?? p.icgId)),
        nextCursor: currentCursor,
        totalCount,
        filters: filtersToRecord(filters, groupBy),
        slot,
        scrollY: 0,
      });
    },
    [totalCount, filters, slot, groupBy],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const ctx = loadBrowseContext();
      if (ctx && filtersMatch(filtersToRecord(filters, groupBy), ctx.filters) && ctx.ids.length > orderedPersons.length) {
        return;
      }
    }
    saveBrowseContextFromState(orderedPersons, cursor);
  }, [orderedPersons, cursor, saveBrowseContextFromState, filters, groupBy]);

  function handleCardClick() {
    updateBrowseScrollY(window.scrollY);
  }

  function handleToggleStar(id: string) {
    toggleStar("people", id);
    setStarredIds(getStarred("people"));
  }

  const handleLoadMore = useCallback(() => {
    if (!cursor || isPending) return;
    startTransition(async () => {
      const result = await loadMorePersons(filters, cursor, slot);
      setPersons((prev) => {
        const next = [...prev, ...result.items];
        const url = new URL(window.location.href);
        url.searchParams.set("loaded", String(next.length));
        window.history.replaceState(null, "", url.toString());
        return next;
      });
      setPhotoMap((prev) => ({ ...prev, ...result.photoMap }));
      setCursor(result.nextCursor);
    });
  }, [cursor, isPending, filters, slot]);

  useEffect(() => { loadMoreFnRef.current = handleLoadMore; });

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

  const filtersActive = hasActiveFilters(filters);

  const starredItems = useMemo(
    () =>
      persons
        .filter((p) => starredIds.includes(p.id))
        .sort((a, b) => starredIds.indexOf(a.id) - starredIds.indexOf(b.id))
        .map((p) => ({
          id: p.id,
          href: `/people/${p.id}`,
          photo: photoMap[p.id]
            ? { thumbUrl: photoMap[p.id].url, focalX: photoMap[p.id].focalX, focalY: photoMap[p.id].focalY }
            : undefined,
          label: p.commonAlias ?? p.icgId,
        })),
    [persons, starredIds, photoMap],
  );

  const gridClass = cn(
    "grid",
    isPoster
      ? isCompact
        ? "gap-2 grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10"
        : "gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
      : cn(
          "gap-4",
          isCompact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        ),
  );

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

  // ── Grouped render mode ──────────────────────────────────────────────────────
  if (groupBy !== "none" && groups) {
    return (
      <div className="space-y-4">
        {/* Collapse / expand all */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
            {groups.length} {groups.length === 1 ? "group" : "groups"} · {totalCount}{" "}
            {totalCount === 1 ? "person" : "people"}
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
            return (
              <div key={group.key} className="space-y-2">
                <GroupHeader
                  label={group.label}
                  count={group.items.length}
                  level={1}
                  collapsed={collapsed}
                  onToggle={() => toggle(group.key)}
                  icon={
                    groupBy === "nationality" && group.key !== "Unknown"
                      ? <FlagImage code={group.key} size={18} className="shrink-0" />
                      : undefined
                  }
                />
                {!collapsed && (
                  <div className={gridClass}>
                    {group.items.map((person) => {
                      const photo = photoMap[person.id];
                      return (
                        <PersonCard
                          key={person.id}
                          person={person}
                          photoUrl={photo?.url}
                          focalX={photo?.focalX}
                          focalY={photo?.focalY}
                          plausibilityCount={getQuickPlausibilityCount(person)}
                          isStarred={starredIds.includes(person.id)}
                          onToggleStar={handleToggleStar}
                          onClick={handleCardClick}
                        />
                      );
                    })}
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
          onUnstar={(id) => handleToggleStar(id)}
          aspectRatio="2/3"
        />
      )}

      {/* Section label + select toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/50">
          {filtersActive ? `Filtered (${totalCount})` : `All People (${totalCount})`}
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
                  isStarred={starredIds.includes(person.id)}
                  onToggleStar={handleToggleStar}
                  onClick={bulk.isSelecting ? () => bulk.toggle(person.id) : handleCardClick}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Count + infinite scroll sentinel */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Showing {persons.length} of {totalCount}{" "}
          {totalCount === 1 ? "person" : "people"}
        </p>
        {isPending && <Loader2 size={18} className="animate-spin text-muted-foreground/50" />}
      </div>
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />

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
