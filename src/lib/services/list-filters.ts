import { findTagMatchIds, resolveTagFilterParam } from "@/lib/services/tag-filter-service";
import { getIntensityMax } from "@/lib/services/intensity-catalog-service";
import { getPotentialDuplicatePairs } from "@/lib/services/set-merge-service";
import { withIntensityFilter, withRatedFilter } from "@/lib/intensity";
import { parsePartialDateBound } from "@/lib/utils";
import type { SessionFilters, SessionSort } from "@/lib/services/session-service";
import type { CastCountBucket, SetFilters, SetSort } from "@/lib/services/set-service";
import type { SessionStatus, SetType } from "@/lib/types";
import type { ListParams } from "@/lib/rating-queue";

export type { ListParams };

// The /sessions and /sets URL parameters turned into their list filters — in
// one place, because the rating queue (2026-10-25) walks the same list the
// browser shows: `?rate=sessions?<its query>` on a session page.


const SESSION_STATUSES = new Set<string>(["DRAFT", "CONFIRMED"]);
const SESSION_SORTS = new Set<string>([
  "newest", "date-desc", "date-asc", "name-asc", "name-desc",
  "media-desc", "updated", "contributors-desc", "sets-desc",
]);

export async function sessionListFilters(params: ListParams) {
  const { q, status, sort, label, project, personId, personSupport, dateFrom, dateTo, createdFrom, createdTo, tags, intensity, rated } = params;
  // ADR-0033: tag filter → matching session ids, ANDed with the other filters.
  // The Intensity and Rated filters ride on the same query (ADR-0036)
  const intensityMax = await getIntensityMax();
  const tagFilter = await resolveTagFilterParam(withRatedFilter(withIntensityFilter(tags, intensity, intensityMax), rated), "SESSION");
  const tagMatchIds = tagFilter ? await findTagMatchIds("SESSION", tagFilter.resolved) : undefined;

  const filters: SessionFilters = {
    ids: tagMatchIds,
    q: q?.trim() || undefined,
    status: status && SESSION_STATUSES.has(status) ? (status as SessionStatus) : "all",
    type: "PRODUCTION",
    labelId: label || undefined,
    projectId: project || undefined,
    personId: personId || undefined,
    personInclSupport: personSupport === "true" || undefined,
    // yyyy / yyyy-mm / yyyy-mm-dd, the "to" bound to the period's last instant —
    // so a card's month (dateFrom = dateTo = 2016-08) covers all of August
    dateFrom: parsePartialDateBound(dateFrom, "start"),
    dateTo: parsePartialDateBound(dateTo, "end"),
    createdFrom: parsePartialDateBound(createdFrom, "start"),
    createdTo: parsePartialDateBound(createdTo, "end"),
    sort: sort && SESSION_SORTS.has(sort) ? (sort as SessionSort) : undefined,
  };
  return { filters, tagFilter, intensityMax };
}

const SET_TYPES = new Set<string>(["photo", "video"]);
const SET_CAST_COUNTS = new Set<string>(["1", "2", "3", "4", "5plus"]);
const SET_SORTS = new Set<string>([
  "date-desc", "date-asc", "title-asc", "title-desc", "newest", "media-desc", "updated",
  "rating-desc", "rating-asc",
]);
const SET_ARCHIVE_FILTERS = new Set(["noArchive", "verified", "changed", "missing", "notImported"]);

export async function setListFilters(params: ListParams) {
  const {
    q, type, sort, channel, label, personId, personSupport, castCount, hasMedia, archiveFilter, noArchiveLink, duplicates,
    releaseDateFrom, releaseDateTo, rating, tags, intensity, rated,
  } = params;

  // Default to photosets: absent type → "photo"; explicit "all" → no type filter.
  const resolvedType: SetType | "all" = type === "all" ? "all" : type && SET_TYPES.has(type) ? (type as SetType) : "photo";

  const duplicatesOnly = duplicates === "true";
  // When filtering by duplicates, get the pairs first to obtain the set IDs
  const duplicatePairs = duplicatesOnly ? await getPotentialDuplicatePairs() : [];
  const duplicateSetIds = duplicatesOnly ? [...new Set(duplicatePairs.flatMap((p) => [p.idA, p.idB]))] : undefined;
  // Map each set ID to the ID of its pair partner (for badge display)
  const duplicatePairMap = new Map<string, string>(duplicatePairs.flatMap((p) => [[p.idA, p.idB], [p.idB, p.idA]]));

  // ADR-0033: tag filter → matching set ids (within the duplicates view when on).
  // The set filters read an empty id list as "no restriction", so no match is
  // passed as an id that cannot exist.
  // The Intensity and Rated filters ride on the same query (ADR-0036)
  const intensityMax = await getIntensityMax();
  const tagFilter = await resolveTagFilterParam(withRatedFilter(withIntensityFilter(tags, intensity, intensityMax), rated), "SET");
  const tagMatchIds = tagFilter ? await findTagMatchIds("SET", tagFilter.resolved, duplicateSetIds) : undefined;
  const restrictIds = tagMatchIds ? (tagMatchIds.length > 0 ? tagMatchIds : ["__no_tag_match__"]) : duplicateSetIds;

  // Parse rating multifacet param: comma-separated "1".."5" + "unrated".
  const ratings = rating
    ? rating
        .split(",")
        .filter(Boolean)
        .map((v) => (v === "unrated" ? ("unrated" as const) : parseInt(v, 10)))
        .filter((v): v is number | "unrated" => v === "unrated" || (typeof v === "number" && v >= 1 && v <= 5 && !isNaN(v)))
    : undefined;

  const castCounts = castCount ? castCount.split(",").filter((v): v is CastCountBucket => SET_CAST_COUNTS.has(v)) : [];

  // Channel / Label are multi-select: comma-separated id lists.
  const channelIds = channel ? channel.split(",").filter(Boolean) : [];
  const labelIds = label ? label.split(",").filter(Boolean) : [];

  const filters: SetFilters = {
    q: q?.trim() || undefined,
    type: resolvedType,
    labelIds: labelIds.length > 0 ? labelIds : undefined,
    channelIds: channelIds.length > 0 ? channelIds : undefined,
    personId: personId || undefined,
    personInclSupport: personSupport === "true" || undefined,
    castCounts: castCounts.length > 0 ? castCounts : undefined,
    hasMedia: hasMedia === "true" ? true : undefined,
    sort: sort && SET_SORTS.has(sort) ? (sort as SetSort) : undefined,
    archiveFilter: archiveFilter && SET_ARCHIVE_FILTERS.has(archiveFilter) ? (archiveFilter as SetFilters["archiveFilter"]) : undefined,
    noArchiveLink: noArchiveLink === "true" ? true : undefined,
    ids: restrictIds,
    ratings,
    // Year-granular: "2016" → Jan 1 (from) / Dec 31 (to); full date kept as-is.
    releaseDateFrom: parsePartialDateBound(releaseDateFrom, "start"),
    releaseDateTo: parsePartialDateBound(releaseDateTo, "end"),
  };
  return { filters, tagFilter, intensityMax, duplicatesOnly, duplicatePairs, duplicatePairMap };
}
