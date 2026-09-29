"use client";

import { useCallback, useMemo, useState } from "react";
import {
  EMPTY_PEOPLE_FILTER,
  isPeopleFilterActive,
  matchesPeopleFilter,
  shownPeople,
} from "@/lib/gallery-people-filter";
import type { PeopleFilter } from "@/lib/gallery-people-filter";
import type { GalleryItem } from "@/lib/types";
import type { GalleryCastMember } from "@/lib/types/gallery";

/**
 * The "people shown" filter state of a gallery (ADR-0023), shared by the set and
 * session galleries. `filterItems` answers "what would this filter show" for an
 * arbitrary list, so a caller can prune its selection before React re-renders.
 */
export function usePeopleFilter(items: GalleryItem[], cast: GalleryCastMember[] | undefined) {
  const [filter, setFilter] = useState<PeopleFilter>(EMPTY_PEOPLE_FILTER);
  const castIds = useMemo(() => (cast ?? []).map((c) => c.id), [cast]);
  const active = isPeopleFilterActive(filter);

  const filterItems = useCallback(
    (list: GalleryItem[], f: PeopleFilter = filter) =>
      isPeopleFilterActive(f)
        ? list.filter((it) => matchesPeopleFilter(shownPeople(it, castIds), f))
        : list,
    [filter, castIds],
  );

  const filteredItems = useMemo(() => filterItems(items), [filterItems, items]);

  return { filter, setFilter, active, filteredItems, filterItems };
}
