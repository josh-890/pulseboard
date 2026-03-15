import { Suspense } from "react";
import { Users } from "lucide-react";
import {
  getPersonsPaginated,
  getDistinctNaturalHairColors,
  getDistinctBodyTypes,
  getDistinctEthnicities,
} from "@/lib/services/person-service";
import type { PersonSort } from "@/lib/services/person-service";
import { getHeadshotsForPersons } from "@/lib/services/media-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import type { PersonStatus } from "@/lib/types";
import { PersonList } from "@/components/people/person-list";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
import { HeadshotSlotSelector } from "@/components/people/headshot-slot-selector";
import { BodyRegionFilterWrapper } from "@/components/people/body-region-filter-wrapper";
import { AddPersonSheet } from "@/components/people/add-person-sheet";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_LOADED = 500;

type PeoplePageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    hairColor?: string;
    bodyType?: string;
    ethnicity?: string;
    bodyRegions?: string;
    bodyRegionMatch?: string;
    loaded?: string;
    slot?: string;
    sort?: string;
  }>;
};

const VALID_STATUSES = new Set<string>(["active", "inactive", "wishlist", "archived"]);
const VALID_SORTS = new Set<string>([
  "name-asc", "name-desc", "newest", "oldest",
  "age-asc", "age-desc", "rating-desc", "updated",
]);

function isPersonStatus(value: string): value is PersonStatus {
  return VALID_STATUSES.has(value);
}

function isPersonSort(value: string): value is PersonSort {
  return VALID_SORTS.has(value);
}

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "age-asc", label: "Youngest first" },
  { value: "age-desc", label: "Oldest people" },
  { value: "rating-desc", label: "Highest rated" },
  { value: "updated", label: "Recently updated" },
];

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const {
    q, status, hairColor, bodyType, ethnicity, bodyRegions: bodyRegionsParam,
    bodyRegionMatch: bodyRegionMatchParam, loaded,
    slot: slotParam, sort: sortParam,
  } = await searchParams;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const resolvedStatus =
    status && isPersonStatus(status) ? status : undefined;
  const resolvedSort =
    sortParam && isPersonSort(sortParam) ? sortParam : undefined;
  const resolvedBodyRegions = bodyRegionsParam?.split(",").filter(Boolean);
  const resolvedBodyRegionMatch =
    bodyRegionMatchParam === "all" ? ("all" as const) : ("any" as const);

  const filters = {
    q: q?.trim() || undefined,
    status: resolvedStatus ?? ("all" as const),
    naturalHairColor: hairColor || undefined,
    bodyType: bodyType || undefined,
    ethnicity: ethnicity || undefined,
    bodyRegions: resolvedBodyRegions?.length ? resolvedBodyRegions : undefined,
    bodyRegionMatch: resolvedBodyRegionMatch,
    sort: resolvedSort,
  };

  const parsedSlot = slotParam ? parseInt(slotParam, 10) : undefined;
  const slot = parsedSlot && parsedSlot >= 1 && parsedSlot <= 5 ? parsedSlot : undefined;

  const [paginated, hairColors, bodyTypes, ethnicities, slotLabels] = await Promise.all([
    getPersonsPaginated(filters, undefined, limit),
    getDistinctNaturalHairColors(),
    getDistinctBodyTypes(),
    getDistinctEthnicities(),
    getProfileImageLabels(),
  ]);

  // Batch-load profile photos for visible persons (MediaItem-only)
  const personIds = paginated.items.map((p) => p.id);
  const headshotMap = await getHeadshotsForPersons(personIds, slot);

  const photoMap: Record<string, { url: string; focalX: number | null; focalY: number | null }> = {};
  for (const id of personIds) {
    const headshot = headshotMap.get(id);
    if (headshot) {
      photoMap[id] = headshot;
    }
  }

  // Build filter groups for toolbar
  const filterGroups: FilterGroup[] = [
    {
      type: "pill",
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
        { value: "wishlist", label: "Wishlist" },
        { value: "archived", label: "Archived" },
      ],
    },
  ];

  if (hairColors.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "hairColor",
      label: "Hair Color",
      options: hairColors.map((c) => ({ value: c, label: c })),
    });
  }

  if (bodyTypes.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "bodyType",
      label: "Body Type",
      options: bodyTypes.map((t) => ({ value: t, label: t })),
    });
  }

  if (ethnicities.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "ethnicity",
      label: "Ethnicity",
      options: ethnicities.map((e) => ({ value: e, label: e })),
    });
  }

  const toolbarConfig: BrowserToolbarConfig = {
    basePath: "/people",
    searchPlaceholder: "Search people...",
    sortOptions: SORT_OPTIONS,
    defaultSort: "name-asc",
    filterGroups,
    resultCount: paginated.items.length,
    totalCount: paginated.totalCount,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Users size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">People</h1>
            <p className="text-sm text-muted-foreground">
              {paginated.totalCount} {paginated.totalCount === 1 ? "person" : "people"}
            </p>
          </div>
        </div>
        <AddPersonSheet />
      </div>

      {/* Unified toolbar */}
      <Suspense>
        <BrowserToolbar config={toolbarConfig}>
          <BodyRegionFilterWrapper />
          <HeadshotSlotSelector slotLabels={slotLabels} />
        </BrowserToolbar>
      </Suspense>

      {/* People grid */}
      <PersonList
        persons={paginated.items}
        photoMap={photoMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
        slot={slot}
      />
    </div>
  );
}
