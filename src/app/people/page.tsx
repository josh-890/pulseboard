import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import Link from "next/link";
import { Sparkles, Users } from "lucide-react";
import {
  getPersonsPaginated,
  getDistinctNaturalHairColors,
  getDistinctBodyTypes,
  getDistinctEthnicities,
  getPersonFacetCounts,
} from "@/lib/services/person-service";
import type { PersonSort } from "@/lib/services/person-service";
import { getHeadshotsForPersons } from "@/lib/services/media-service";
import { getProfileImageLabels } from "@/lib/services/setting-service";
import type { PersonStatus } from "@/lib/types";
import { PersonList } from "@/components/people/person-list";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
import { SavedViewsBar } from "@/components/shared/saved-views-bar";
import { HeadshotSlotSelector } from "@/components/people/headshot-slot-selector";
import { BodyRegionFilterWrapper } from "@/components/people/body-region-filter-wrapper";
import { AddPersonSheet } from "@/components/people/add-person-sheet";
import { PeopleSearchPage } from "@/components/people/people-search-page";

const ADVANCED_PREFIXES = ["cat.", "range.", "presence.", "region.", "text.", "attr."];
function hasAdvancedParams(params: Record<string, unknown>): boolean {
  if (params.mode === "advanced") return true;
  if (params.time === "ever" || params.time === "current") return true;
  return Object.keys(params).some((k) => ADVANCED_PREFIXES.some((p) => k.startsWith(p)));
}

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
    completeness?: string;
    birthdateFrom?: string;
    birthdateTo?: string;
    createdFrom?: string;
    createdTo?: string;
    groupBy?: string;
  }>;
};

const VALID_STATUSES = new Set<string>(["active", "inactive", "wishlist", "archived"]);
const VALID_SORTS = new Set<string>([
  "name-asc", "name-desc", "newest", "oldest",
  "age-asc", "age-desc", "rating-desc", "updated",
  "completeness-asc", "completeness-desc",
]);
const VALID_COMPLETENESS = new Set<string>(["low", "medium", "high"]);
const VALID_GROUP_BYS = new Set<string>([
  "none", "nationality", "career_decade", "name_az", "age_current", "age_career_start",
]);

const PEOPLE_GROUP_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "nationality", label: "Nationality" },
  { value: "career_decade", label: "Career decade" },
  { value: "name_az", label: "Name A–Z" },
  { value: "age_current", label: "Current age" },
  { value: "age_career_start", label: "Age at career start" },
];

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
  { value: "completeness-asc", label: "Profile ↑" },
  { value: "completeness-desc", label: "Profile ↓" },
];

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  return withTenantFromHeaders(async () => {
    const raw = await searchParams;
    if (hasAdvancedParams(raw as Record<string, unknown>)) {
      return <PeopleSearchPage searchParams={raw as Record<string, string>} />;
    }
    const {
      q, status, hairColor, bodyType, ethnicity, bodyRegions: bodyRegionsParam,
      bodyRegionMatch: bodyRegionMatchParam, loaded,
      slot: slotParam, sort: sortParam, completeness: completenessParam,
      birthdateFrom: birthdateFromParam, birthdateTo: birthdateToParam,
      createdFrom: createdFromParam, createdTo: createdToParam,
      groupBy: groupByParam,
    } = raw;

  const groupBy = groupByParam && VALID_GROUP_BYS.has(groupByParam) ? groupByParam : "none";

  const limit = groupBy !== "none"
    ? MAX_LOADED
    : Math.min(Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE), MAX_LOADED);

  const resolvedStatus =
    status && isPersonStatus(status) ? status : undefined;
  const resolvedSort =
    sortParam && isPersonSort(sortParam) ? sortParam : undefined;
  const resolvedBodyRegions = bodyRegionsParam?.split(",").filter(Boolean);
  const resolvedBodyRegionMatch =
    bodyRegionMatchParam === "all" ? ("all" as const) : ("any" as const);
  const resolvedCompleteness =
    completenessParam && VALID_COMPLETENESS.has(completenessParam)
      ? (completenessParam as "low" | "medium" | "high")
      : undefined;
  const birthdateFrom = parseDate(birthdateFromParam);
  const birthdateTo = parseDate(birthdateToParam);
  const createdFrom = parseDate(createdFromParam);
  const createdTo = parseDate(createdToParam);

  const filters = {
    q: q?.trim() || undefined,
    status: resolvedStatus ?? ("all" as const),
    naturalHairColor: hairColor || undefined,
    bodyType: bodyType || undefined,
    ethnicity: ethnicity || undefined,
    bodyRegions: resolvedBodyRegions?.length ? resolvedBodyRegions : undefined,
    bodyRegionMatch: resolvedBodyRegionMatch,
    sort: resolvedSort,
    completeness: resolvedCompleteness,
    birthdateFrom,
    birthdateTo,
    createdFrom,
    createdTo,
  };

  const parsedSlot = slotParam ? parseInt(slotParam, 10) : undefined;
  const slot = parsedSlot && parsedSlot >= 1 && parsedSlot <= 5 ? parsedSlot : undefined;

  const [paginated, hairColors, bodyTypes, ethnicities, slotLabels, facetCounts] = await Promise.all([
    getPersonsPaginated(filters, undefined, limit),
    getDistinctNaturalHairColors(),
    getDistinctBodyTypes(),
    getDistinctEthnicities(),
    getProfileImageLabels(),
    getPersonFacetCounts(filters),
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
        { value: "active", label: "Active", count: facetCounts.status["active"] },
        { value: "inactive", label: "Inactive", count: facetCounts.status["inactive"] },
        { value: "wishlist", label: "Wishlist", count: facetCounts.status["wishlist"] },
        { value: "archived", label: "Archived", count: facetCounts.status["archived"] },
      ],
    },
  ];

  filterGroups.push({
    type: "pill",
    param: "completeness",
    label: "Profile",
    options: [
      { value: "all", label: "All" },
      { value: "low", label: "Incomplete" },
      { value: "medium", label: "Partial" },
      { value: "high", label: "Complete" },
    ],
  });

  filterGroups.push({
    type: "daterange",
    paramFrom: "birthdateFrom",
    paramTo: "birthdateTo",
    label: "Birthdate",
  });

  filterGroups.push({
    type: "daterange",
    paramFrom: "createdFrom",
    paramTo: "createdTo",
    label: "Added",
  });

  if (hairColors.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "hairColor",
      label: "Hair Color",
      options: hairColors.map((c) => ({
        value: c,
        label: c,
        count: facetCounts.naturalHairColor[c],
      })),
    });
  }

  if (bodyTypes.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "bodyType",
      label: "Body Type",
      options: bodyTypes.map((t) => ({
        value: t,
        label: t,
        count: facetCounts.bodyType[t],
      })),
    });
  }

  if (ethnicities.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "ethnicity",
      label: "Ethnicity",
      options: ethnicities.map((e) => ({
        value: e,
        label: e,
        count: facetCounts.ethnicity[e],
      })),
    });
  }

  const toolbarConfig: BrowserToolbarConfig = {
    basePath: "/people",
    searchPlaceholder: "Search people…",
    sortOptions: SORT_OPTIONS,
    defaultSort: "name-asc",
    filterGroups,
    resultCount: paginated.items.length,
    totalCount: paginated.totalCount,
    browseContextKey: "pulseboard-browse-context",
    groupByOptions: PEOPLE_GROUP_OPTIONS,
    defaultGroupBy: "none",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-person/15">
            <Users size={20} className="text-entity-person" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">People</h1>
            <p className="text-sm text-muted-foreground">
              {paginated.totalCount} {paginated.totalCount === 1 ? "person" : "people"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/people?mode=advanced"
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
          >
            <Sparkles size={12} />
            Advanced filters
          </Link>
          <AddPersonSheet />
        </div>
      </div>

      {/* Saved views */}
      <Suspense>
        <SavedViewsBar storageKey="pulseboard-views-/people" basePath="/people" />
      </Suspense>

      {/* Unified toolbar */}
      <Suspense>
        <BrowserToolbar config={toolbarConfig}>
          <BodyRegionFilterWrapper />
          <HeadshotSlotSelector slotLabels={slotLabels} />
        </BrowserToolbar>
      </Suspense>

      {/* People grid */}
      <PersonList
        key={JSON.stringify(filters) + groupBy}
        persons={paginated.items}
        photoMap={photoMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
        slot={slot}
        groupBy={groupBy}
      />
    </div>
    );
  });
}
