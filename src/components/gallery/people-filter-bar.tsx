"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import type { GalleryCastMember } from "@/lib/types/gallery";
import {
  cycleChip,
  filterForCombination,
  isCombinationFilter,
  isPeopleFilterActive,
  peopleCombinations,
  shownPeople,
  EMPTY_PEOPLE_FILTER,
} from "@/lib/gallery-people-filter";
import type { PeopleFilter } from "@/lib/gallery-people-filter";

type PeopleFilterBarProps = {
  cast: GalleryCastMember[];
  /** Every image of the set — the combinations and their counts come from here. */
  items: GalleryItem[];
  /** The images the current filter lets through — the chip counts come from here. */
  visibleItems: GalleryItem[];
  filter: PeopleFilter;
  onChange: (filter: PeopleFilter) => void;
};

const CHIP_TITLE = "Click: must show → must not show → off";

/**
 * "People shown" filter for a multi-person set (ADR-0023). Two rows:
 * the combinations the images actually contain (one click = exactly that group),
 * and three-state person chips for anything looser ("shows A, whoever else").
 */
export function PeopleFilterBar({ cast, items, visibleItems, filter, onChange }: PeopleFilterBarProps) {
  const castIds = useMemo(() => cast.map((c) => c.id), [cast]);
  const nameById = useMemo(() => new Map(cast.map((c) => [c.id, c.name])), [cast]);
  const combos = useMemo(() => peopleCombinations(items, castIds), [items, castIds]);
  const visibleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of visibleItems) {
      for (const id of shownPeople(it, castIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [visibleItems, castIds]);
  const active = isPeopleFilterActive(filter);

  function comboLabel(personIds: string[]): string {
    if (personIds.length === 0) return "Nobody";
    const names = personIds.map((id) => nameById.get(id) ?? "?");
    return names.length === 1 ? `${names[0]} alone` : names.join(" + ");
  }

  return (
    <div className="mb-3 space-y-1.5">
      {/* Combinations that occur — the one-click answer to "only A" */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by combination">
        <span className="mr-1 w-12 shrink-0 text-xs text-muted-foreground">Groups:</span>
        {combos.map((c) => {
          const on = isCombinationFilter(filter, c.personIds, castIds);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? EMPTY_PEOPLE_FILTER : filterForCombination(c.personIds, castIds))
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-white/15 bg-card/40 text-muted-foreground hover:border-white/30 hover:text-foreground",
                c.personIds.length === 0 && "italic",
              )}
            >
              {comboLabel(c.personIds)}
              <span className="tabular-nums text-muted-foreground/80">{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* Per-person chips — include / exclude, combined with AND */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by person">
        <span className="mr-1 w-12 shrink-0 text-xs text-muted-foreground">Shows:</span>
        {cast.map((c) => {
          const state = filter[c.id];
          const count = visibleCounts.get(c.id) ?? 0;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(cycleChip(filter, c.id))}
              title={CHIP_TITLE}
              aria-label={`${c.name}: ${
                state === "include" ? "must be shown" : state === "exclude" ? "must not be shown" : "any"
              }`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                state === "include" && "border-primary bg-primary text-primary-foreground shadow-sm",
                state === "exclude" &&
                  "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400 line-through decoration-red-500/70",
                state === undefined &&
                  "border-white/20 bg-card/50 text-muted-foreground hover:border-white/30 hover:text-foreground",
              )}
            >
              {state === "include" && <Check size={11} aria-hidden />}
              {state === "exclude" && <X size={11} aria-hidden />}
              {c.name}
              {state !== "exclude" && (
                <span className={cn("tabular-nums", state === "include" ? "opacity-80" : "opacity-60")}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_PEOPLE_FILTER)}
            className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
