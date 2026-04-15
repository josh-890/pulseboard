import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { ImageIcon } from "lucide-react";
import { getSetsPaginated, getChannelsWithLabelMaps, getRecentChannels, getLastUsedSetType } from "@/lib/services/set-service";
import { getSuggestedFoldersForSets } from "@/lib/services/archive-service";
import type { SetSort, SetFilters } from "@/lib/services/set-service";
import { getCoverPhotosForSets, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getAllContributionRoleGroups } from "@/lib/services/contribution-role-service";
import type { SetType } from "@/lib/types";
import { SetGrid } from "@/components/sets/set-grid";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
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
    hasMedia?: string;
    archiveFilter?: string;
  }>;
};

const VALID_TYPES = new Set<string>(["photo", "video"]);
const VALID_SORTS = new Set<string>([
  "date-desc", "date-asc", "title-asc", "title-desc", "newest", "media-desc",
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
  { value: "media-desc", label: "Most media" },
];

export default async function SetsPage({ searchParams }: SetsPageProps) {
  return withTenantFromHeaders(async () => {
    const {
      q, type, loaded, sort: sortParam,
      channel: channelId, label: labelId,
      hasMedia: hasMediaParam,
      archiveFilter: archiveFilterParam,
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

  const filters: SetFilters = {
    q: q?.trim() || undefined,
    type: resolvedType ?? ("all" as const),
    labelId: labelId || undefined,
    channelId: channelId || undefined,
    hasMedia: hasMediaParam === "true" ? true : undefined,
    sort: resolvedSort,
    archiveFilter,
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

  const filterGroups: FilterGroup[] = [
    {
      type: "pill",
      param: "type",
      label: "Type",
      options: [
        { value: "all", label: "All" },
        { value: "photo", label: "Photos" },
        { value: "video", label: "Videos" },
      ],
    },
  ];

  if (channelOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "channel",
      label: "Channel",
      options: channelOptions,
      searchable: true,
    });
  }

  if (labelOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "label",
      label: "Label",
      options: labelOptions,
      searchable: true,
    });
  }

  filterGroups.push({
    type: "toggle",
    param: "hasMedia",
    label: "Has media",
  });

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
    searchPlaceholder: "Search sets...",
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
      />
    </div>
    );
  });
}
