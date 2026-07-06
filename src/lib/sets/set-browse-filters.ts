import type { SetFilters, SetSort, CastCountBucket } from "@/lib/services/set-service";

/**
 * Single source of truth for the Set browser's SetFilters ⇄ URL-params
 * round-trip used by the browse context (grid saves it; the detail-page pager
 * reads it for prev/next + the "back" link). `setFiltersToParams` and
 * `paramsToSetFilters` MUST stay exact inverses, or prev/next navigation and
 * the return URL silently drop a filter (the bug this replaced: castCount /
 * rating / hasMedia / archive were missing from the old hand-maintained
 * allow-lists).
 *
 * NOTE: the authoritative URL→filter parser is `src/app/sets/page.tsx` (it also
 * owns the browse default of type=photo and year-granular date expansion). This
 * pair only needs to be internally consistent so the context round-trips.
 */

const VALID_SORTS = new Set<string>([
  "date-desc", "date-asc", "title-asc", "title-desc", "newest", "media-desc", "updated", "rating-desc", "rating-asc",
]);
const VALID_CAST = new Set<string>(["1", "2", "3", "4", "5plus"]);
const VALID_ARCHIVE = new Set<string>(["noArchive", "verified", "changed", "missing", "notImported"]);

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function setFiltersToParams(filters: SetFilters): Record<string, string> {
  const r: Record<string, string> = {};
  if (filters.q) r.q = filters.q;
  if (filters.type && filters.type !== "all") r.type = filters.type;
  if (filters.channelId) r.channel = filters.channelId;
  if (filters.labelId) r.label = filters.labelId;
  if (filters.personId) r.personId = filters.personId;
  if (filters.castCounts && filters.castCounts.length > 0) r.castCount = filters.castCounts.join(",");
  if (filters.ratings && filters.ratings.length > 0) r.rating = filters.ratings.map(String).join(",");
  if (filters.hasMedia) r.hasMedia = "true";
  if (filters.archiveFilter) r.archiveFilter = filters.archiveFilter;
  if (filters.noArchiveLink) r.noArchiveLink = "true";
  if (filters.sort) r.sort = filters.sort;
  if (filters.releaseDateFrom) r.releaseDateFrom = isoDate(filters.releaseDateFrom);
  if (filters.releaseDateTo) r.releaseDateTo = isoDate(filters.releaseDateTo);
  if (filters.createdFrom) r.createdFrom = isoDate(filters.createdFrom);
  if (filters.createdTo) r.createdTo = isoDate(filters.createdTo);
  return r;
}

function parseCastCounts(v: string): CastCountBucket[] | undefined {
  const out = v.split(",").filter((x): x is CastCountBucket => VALID_CAST.has(x));
  return out.length > 0 ? out : undefined;
}

function parseRatings(v: string): (number | "unrated")[] | undefined {
  const out = v
    .split(",")
    .filter(Boolean)
    .map((x) => (x === "unrated" ? ("unrated" as const) : parseInt(x, 10)))
    .filter((x): x is number | "unrated" => x === "unrated" || (typeof x === "number" && x >= 1 && x <= 5 && !Number.isNaN(x)));
  return out.length > 0 ? out : undefined;
}

export function paramsToSetFilters(s: Record<string, string>): SetFilters {
  return {
    q: s.q || undefined,
    type: s.type === "photo" || s.type === "video" ? s.type : "all",
    channelId: s.channel || undefined,
    labelId: s.label || undefined,
    personId: s.personId || undefined,
    castCounts: s.castCount ? parseCastCounts(s.castCount) : undefined,
    ratings: s.rating ? parseRatings(s.rating) : undefined,
    hasMedia: s.hasMedia === "true" ? true : undefined,
    archiveFilter: VALID_ARCHIVE.has(s.archiveFilter) ? (s.archiveFilter as SetFilters["archiveFilter"]) : undefined,
    noArchiveLink: s.noArchiveLink === "true" ? true : undefined,
    sort: VALID_SORTS.has(s.sort) ? (s.sort as SetSort) : undefined,
    releaseDateFrom: s.releaseDateFrom ? new Date(s.releaseDateFrom) : undefined,
    releaseDateTo: s.releaseDateTo ? new Date(s.releaseDateTo) : undefined,
    createdFrom: s.createdFrom ? new Date(s.createdFrom) : undefined,
    createdTo: s.createdTo ? new Date(s.createdTo) : undefined,
  };
}
