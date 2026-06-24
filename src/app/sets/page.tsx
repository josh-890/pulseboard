import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { ImageIcon } from "lucide-react";
import { getSetsPaginated, getChannelsWithLabelMaps, getRecentChannels, getLastUsedSetType, getSetFacetCounts } from "@/lib/services/set-service";
import { getSuggestedFoldersForSets } from "@/lib/services/archive-service";
import { getPotentialDuplicatePairs } from "@/lib/services/set-merge-service";
import type { SetSort, SetFilters } from "@/lib/services/set-service";
import { getCoverPhotosForSets, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";
import type { SetType } from "@/lib/types";
import { SetGrid } from "@/components/sets/set-grid";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
import { SavedViewsBar } from "@/components/shared/saved-views-bar";
import { AddSetSheet } from "@/components/sets/add-set-sheet";
import { ratingFilterOptions } from "@/components/shared/rating-filter-options";
import { parsePartialDateBound } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_LOADED = 500;

type SetsPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    loaded?: string;
    sort?: string;
    channel?: string;
    label?: string;
    personId?: string;
    personName?: string;
    hasMedia?: string;
    archiveFilter?: string;
    noArchiveLink?: string;
    duplicates?: string;
    releaseDateFrom?: string;
    releaseDateTo?: string;
    rating?: string;
    groupBy?: string;
  }>;
};

const VALID_TYPES = new Set<string>(["photo", "video"]);
const VALID_SORTS = new Set<string>([
  "date-desc", "date-asc", "title-asc", "title-desc", "newest", "media-desc", "updated",
  "rating-desc", "rating-asc",
]);

const VALID_GROUP_BYS = new Set<string>([
  "none", "year", "channel", "channel_year", "label", "youngest_age",
]);

const SETS_GROUP_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "year", label: "Year" },
  { value: "channel", label: "Channel" },
  { value: "channel_year", label: "Channel → Year" },
  { value: "label", label: "Label" },
  { value: "youngest_age", label: "Youngest participant" },
];

function isSetType(value: string): value is SetType {
  return VALID_TYPES.has(value);
}

function isSetSort(value: string): value is SetSort {
  return VALID_SORTS.has(value);
}

const SORT_OPTIONS = [
  { value: "date-desc", label: "Newest release" },
  { value: "date-asc", label: "Oldest release" },
  { value: "title-asc", label: "Title A→Z" },
  { value: "title-desc", label: "Title Z→A" },
  { value: "newest", label: "Recently added" },
  { value: "updated", label: "Recently updated" },
  { value: "media-desc", label: "Most media" },
  { value: "rating-desc", label: "Highest rated" },
  { value: "rating-asc", label: "Lowest rated" },
];

export default async function SetsPage({ searchParams }: SetsPageProps) {
  return withTenantFromHeaders(async () => {
    const {
      q, type, loaded, sort: sortParam,
      channel: channelId, label: labelId,
      personId,
      hasMedia: hasMediaParam,
      archiveFilter: archiveFilterParam,
      noArchiveLink: noArchiveLinkParam,
      duplicates: duplicatesParam,
      releaseDateFrom: releaseDateFromParam,
      releaseDateTo: releaseDateToParam,
      rating: ratingParam,
      groupBy: groupByParam,
    } = await searchParams;

  const groupBy = groupByParam && VALID_GROUP_BYS.has(groupByParam) ? groupByParam : "none";

  const limit = groupBy !== "none"
    ? MAX_LOADED
    : Math.min(Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE), MAX_LOADED);

  // Default to photosets: absent type → "photo"; explicit "all" → no type filter.
  const resolvedType: SetType | "all" =
    type === "all" ? "all" : type && isSetType(type) ? type : "photo";
  const resolvedSort = sortParam && isSetSort(sortParam) ? sortParam : undefined;

  const VALID_ARCHIVE_FILTERS = new Set(['noArchive', 'verified', 'changed', 'missing', 'notImported'])
  const archiveFilter = archiveFilterParam && VALID_ARCHIVE_FILTERS.has(archiveFilterParam)
    ? (archiveFilterParam as SetFilters['archiveFilter'])
    : undefined

  const duplicatesOnly = duplicatesParam === 'true';
  // Year-granular: "2016" → Jan 1 (from) / Dec 31 (to); full date kept as-is.
  const releaseDateFrom = parsePartialDateBound(releaseDateFromParam, "start");
  const releaseDateTo = parsePartialDateBound(releaseDateToParam, "end");

  // When filtering by duplicates, get the pairs first to obtain the set IDs
  const duplicatePairs = duplicatesOnly ? await getPotentialDuplicatePairs() : [];
  const duplicateSetIds = duplicatesOnly
    ? [...new Set(duplicatePairs.flatMap((p) => [p.idA, p.idB]))]
    : undefined;
  // Map each set ID to the ID of its pair partner (for badge display)
  const duplicatePairMap = new Map<string, string>(
    duplicatePairs.flatMap((p) => [[p.idA, p.idB], [p.idB, p.idA]]),
  );

  // Parse rating multifacet param: comma-separated "1".."5" + "unrated".
  const resolvedRatings = ratingParam
    ? ratingParam.split(",").filter(Boolean).map((v) => (v === "unrated" ? ("unrated" as const) : parseInt(v, 10)))
        .filter((v): v is number | "unrated" => v === "unrated" || (typeof v === "number" && v >= 1 && v <= 5 && !isNaN(v)))
    : undefined;

  const filters: SetFilters = {
    q: q?.trim() || undefined,
    type: resolvedType,
    labelId: labelId || undefined,
    channelId: channelId || undefined,
    personId: personId || undefined,
    hasMedia: hasMediaParam === "true" ? true : undefined,
    sort: resolvedSort,
    archiveFilter,
    noArchiveLink: noArchiveLinkParam === 'true' ? true : undefined,
    ids: duplicateSetIds,
    ratings: resolvedRatings,
    releaseDateFrom,
    releaseDateTo,
  };

  const [paginated, channels, recentChannelIds, lastType, roleGroups] = await Promise.all([
    getSetsPaginated(filters, undefined, limit),
    getChannelsWithLabelMaps(),
    getRecentChannels(5),
    getLastUsedSetType(),
    getAllContributionRoleGroups(),
  ]);

  // Batch-load cover thumbnails, headshots, and archive suggestions for initial chunk
  const setIds = paginated.items.map((s) => s.id);
  const allPersonIds = [
    ...new Set(paginated.items.flatMap((s) => s.participants.map((p) => p.personId))),
  ];
  const [coverMapRaw, headshotMapRaw, suggestionsRaw] = await Promise.all([
    getCoverPhotosForSets(setIds),
    getHeadshotsForPersons(allPersonIds),
    getSuggestedFoldersForSets(setIds),
  ]);
  const photoMap = Object.fromEntries(coverMapRaw);
  const headshotMap = Object.fromEntries(headshotMapRaw);
  const suggestionsMap = Object.fromEntries(suggestionsRaw);

  // Build channel and label options from loaded channels
  const channelOptions = channels.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  // Collect unique labels from channel label maps
  // Filter options are the distinct OWNING labels (ADR-0020), matching the
  // set-service label filter which keys on Channel.labelId.
  const labelMap = new Map<string, string>();
  for (const ch of channels) {
    if (ch.labelId && ch.labelName && !labelMap.has(ch.labelId)) {
      labelMap.set(ch.labelId, ch.labelName);
    }
  }
  const labelOptions = Array.from(labelMap.entries()).map(([id, name]) => ({
    value: id,
    label: name,
  }));

  // Facet counts
  const labelIds = labelOptions.map((l) => l.value);
  const facetCounts = await getSetFacetCounts(filters, labelIds);

  const filterGroups: FilterGroup[] = [
    {
      type: "pill",
      param: "type",
      label: "Type",
      defaultValue: "photo", // default browse = photosets
      options: [
        { value: "photo", label: "Photos", count: facetCounts.type["photo"] },
        { value: "video", label: "Videos", count: facetCounts.type["video"] },
        { value: "all", label: "All" },
      ],
    },
    {
      type: "typeahead",
      param: "personId",
      displayParam: "personName",
      label: "Person",
      apiPath: "/api/people/search",
    },
    {
      type: "daterange",
      paramFrom: "releaseDateFrom",
      paramTo: "releaseDateTo",
      label: "Release Date",
      allowPartial: true, // year-granular (e.g. 2016 → 2020)
    },
    {
      type: "multifacet",
      param: "rating",
      label: "Rating",
      searchable: false,
      options: ratingFilterOptions(facetCounts.rating ?? {}),
    },
  ];

  // Housekeeping filters live behind the "Advanced" expander.
  const advancedFilterGroups: FilterGroup[] = [];

  // Only show channels/labels that have matching sets (count > 0) under the current
  // filters — plus the currently-selected one, so an active filter stays visible.
  const channelFacetOptions = channelOptions
    .map((c) => ({ ...c, count: facetCounts.channelId[c.value] ?? 0 }))
    .filter((c) => c.count > 0 || c.value === channelId);
  if (channelFacetOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "channel",
      label: "Channel",
      options: channelFacetOptions,
      searchable: true,
    });
  }

  const labelFacetOptions = labelOptions
    .map((l) => ({ ...l, count: facetCounts.labelId[l.value] ?? 0 }))
    .filter((l) => l.count > 0 || l.value === labelId);
  if (labelFacetOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "label",
      label: "Label",
      options: labelFacetOptions,
      searchable: true,
    });
  }

  advancedFilterGroups.push({
    type: "toggle",
    param: "hasMedia",
    label: "Has media",
  });

  advancedFilterGroups.push({
    type: "toggle",
    param: "noArchiveLink",
    label: "Unlinked only",
  });

  // Potential duplicates filter — load count eagerly only when not already active
  const dupCount = duplicatesOnly ? duplicatePairs.length : await getPotentialDuplicatePairs().then((p) => p.length);
  if (dupCount > 0) {
    advancedFilterGroups.push({
      type: "toggle",
      param: "duplicates",
      label: `Duplicates (${dupCount})`,
    });
  }

  advancedFilterGroups.push({
    type: "pill",
    param: "archiveFilter",
    label: "Archive",
    options: [
      { value: "noArchive",   label: "No archive" },
      { value: "verified",    label: "Verified" },
      { value: "changed",     label: "Changed" },
      { value: "missing",     label: "Missing" },
      { value: "notImported", label: "Not imported" },
    ],
  });

  const toolbarConfig: BrowserToolbarConfig = {
    basePath: "/sets",
    advancedFilterGroups,
    searchPlaceholder: "Search sets…",
    sortOptions: SORT_OPTIONS,
    defaultSort: "date-desc",
    filterGroups,
    resultCount: paginated.items.length,
    totalCount: paginated.totalCount,
    browseContextKey: "pulseboard-set-browse-context",
    groupByOptions: SETS_GROUP_OPTIONS,
    defaultGroupBy: "none",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-set/15">
            <ImageIcon size={20} className="text-entity-set" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Sets</h1>
            <p className="text-sm text-muted-foreground">
              {paginated.totalCount} {paginated.totalCount === 1 ? "set" : "sets"}
            </p>
          </div>
        </div>
        <AddSetSheet
          channels={channels}
          recentChannelIds={recentChannelIds}
          defaultType={lastType}
          roleDefinitions={roleGroups.flatMap((g) =>
            g.definitions.map((d) => ({ id: d.id, name: d.name, groupName: g.name })),
          )}
        />
      </div>

      {/* Saved views */}
      <Suspense>
        <SavedViewsBar storageKey="pulseboard-views-/sets" basePath="/sets" />
      </Suspense>

      {/* Unified toolbar */}
      <Suspense>
        <BrowserToolbar config={toolbarConfig} />
      </Suspense>

      {/* Grid */}
      <SetGrid
        key={JSON.stringify(filters) + groupBy}
        sets={paginated.items}
        photoMap={photoMap}
        headshotMap={headshotMap}
        suggestionsMap={suggestionsMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
        groupBy={groupBy}
        duplicatePairMap={duplicatesOnly ? Object.fromEntries(duplicatePairMap) : undefined}
      />
    </div>
    );
  });
}
