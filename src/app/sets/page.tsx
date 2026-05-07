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
    createdFrom?: string;
    createdTo?: string;
  }>;
};

const VALID_TYPES = new Set<string>(["photo", "video"]);
const VALID_SORTS = new Set<string>([
  "date-desc", "date-asc", "title-asc", "title-desc", "newest", "media-desc", "updated",
]);

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
];

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

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
      createdFrom: createdFromParam,
      createdTo: createdToParam,
    } = await searchParams;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const resolvedType = type && isSetType(type) ? type : undefined;
  const resolvedSort = sortParam && isSetSort(sortParam) ? sortParam : undefined;

  const VALID_ARCHIVE_FILTERS = new Set(['noArchive', 'verified', 'changed', 'missing', 'notImported'])
  const archiveFilter = archiveFilterParam && VALID_ARCHIVE_FILTERS.has(archiveFilterParam)
    ? (archiveFilterParam as SetFilters['archiveFilter'])
    : undefined

  const duplicatesOnly = duplicatesParam === 'true';
  const releaseDateFrom = parseDate(releaseDateFromParam);
  const releaseDateTo = parseDate(releaseDateToParam);
  const createdFrom = parseDate(createdFromParam);
  const createdTo = parseDate(createdToParam);

  // When filtering by duplicates, get the pairs first to obtain the set IDs
  const duplicatePairs = duplicatesOnly ? await getPotentialDuplicatePairs() : [];
  const duplicateSetIds = duplicatesOnly
    ? [...new Set(duplicatePairs.flatMap((p) => [p.idA, p.idB]))]
    : undefined;
  // Map each set ID to the ID of its pair partner (for badge display)
  const duplicatePairMap = new Map<string, string>(
    duplicatePairs.flatMap((p) => [[p.idA, p.idB], [p.idB, p.idA]]),
  );

  const filters: SetFilters = {
    q: q?.trim() || undefined,
    type: resolvedType ?? ("all" as const),
    labelId: labelId || undefined,
    channelId: channelId || undefined,
    personId: personId || undefined,
    hasMedia: hasMediaParam === "true" ? true : undefined,
    sort: resolvedSort,
    archiveFilter,
    noArchiveLink: noArchiveLinkParam === 'true' ? true : undefined,
    ids: duplicateSetIds,
    releaseDateFrom,
    releaseDateTo,
    createdFrom,
    createdTo,
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
  const labelMap = new Map<string, string>();
  for (const ch of channels) {
    for (const lm of ch.labelMaps) {
      if (lm.labelId && lm.labelName && !labelMap.has(lm.labelId)) {
        labelMap.set(lm.labelId, lm.labelName);
      }
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
      options: [
        { value: "all", label: "All" },
        { value: "photo", label: "Photos", count: facetCounts.type["photo"] },
        { value: "video", label: "Videos", count: facetCounts.type["video"] },
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
    },
    {
      type: "daterange",
      paramFrom: "createdFrom",
      paramTo: "createdTo",
      label: "Added",
    },
  ];

  if (channelOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "channel",
      label: "Channel",
      options: channelOptions.map((c) => ({
        ...c,
        count: facetCounts.channelId[c.value],
      })),
      searchable: true,
    });
  }

  if (labelOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "label",
      label: "Label",
      options: labelOptions.map((l) => ({
        ...l,
        count: facetCounts.labelId[l.value],
      })),
      searchable: true,
    });
  }

  filterGroups.push({
    type: "toggle",
    param: "hasMedia",
    label: "Has media",
  });

  filterGroups.push({
    type: "toggle",
    param: "noArchiveLink",
    label: "Unlinked only",
  });

  // Potential duplicates filter — load count eagerly only when not already active
  const dupCount = duplicatesOnly ? duplicatePairs.length : await getPotentialDuplicatePairs().then((p) => p.length);
  if (dupCount > 0) {
    filterGroups.push({
      type: "toggle",
      param: "duplicates",
      label: `Duplicates (${dupCount})`,
    });
  }

  filterGroups.push({
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
    searchPlaceholder: "Search sets…",
    sortOptions: SORT_OPTIONS,
    defaultSort: "date-desc",
    filterGroups,
    resultCount: paginated.items.length,
    totalCount: paginated.totalCount,
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
        key={JSON.stringify(filters)}
        sets={paginated.items}
        photoMap={photoMap}
        headshotMap={headshotMap}
        suggestionsMap={suggestionsMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
        duplicatePairMap={duplicatesOnly ? Object.fromEntries(duplicatePairMap) : undefined}
      />
    </div>
    );
  });
}
