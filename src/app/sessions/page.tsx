import { withTenantFromHeaders } from "@/lib/tenant-context";
import { listSavedFilters } from "@/lib/services/saved-filter-service";
import { Suspense } from "react";
import { Clapperboard } from "lucide-react";
import { getSessionsPaginated, getSessionFacetCounts } from "@/lib/services/session-service";
import { getCoverPhotosForSessions, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getLabels } from "@/lib/services/label-service";
import { getProjects } from "@/lib/services/project-service";
import { SessionGrid } from "@/components/sessions/session-grid";
import { getTagFacets } from "@/lib/services/tag-filter-service";
import { hasIntensityCatalog } from "@/lib/services/intensity-catalog-service";
import { intensityFilterOptions, RATED_FILTER_OPTIONS } from "@/lib/intensity";
import { sessionListFilters } from "@/lib/services/list-filters";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
import { SavedViewsBar } from "@/components/shared/saved-views-bar";
import { AddSessionSheet } from "@/components/sessions/add-session-sheet";
import { RateTheseButton } from "@/components/sessions/intensity";
import { PivotScopeProvider } from "@/components/shared/pivot";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_LOADED = 500;

type SessionsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    label?: string;
    project?: string;
    personId?: string;
    personName?: string;
    personSupport?: string;
    dateFrom?: string;
    dateTo?: string;
    createdFrom?: string;
    createdTo?: string;
    loaded?: string;
    tags?: string;
    intensity?: string;
    rated?: string;
  }>;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Recently created" },
  { value: "date-desc", label: "Session date (newest)" },
  { value: "date-asc", label: "Session date (oldest)" },
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "media-desc", label: "Most media" },
  { value: "updated", label: "Recently updated" },
  { value: "contributors-desc", label: "Most contributors" },
  { value: "sets-desc", label: "Most sets" },
];

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  return withTenantFromHeaders(async () => {
    const params = await searchParams;
    const { loaded, personId } = params;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const { filters, tagFilter, intensityMax } = await sessionListFilters(params);

  const [paginated, labels, projects, facetCounts, tagFacets, hasIntensity] = await Promise.all([
    getSessionsPaginated(filters, undefined, limit),
    getLabels(),
    getProjects(),
    getSessionFacetCounts(filters),
    getTagFacets("SESSION"),
    hasIntensityCatalog(),
  ]);

  // Batch-load cover photos and contributor headshots
  const sessionIds = paginated.items.map((s) => s.id);
  const allPersonIds = [
    ...new Set(paginated.items.flatMap((s) => s.contributions.map((c) => c.person.id))),
  ];
  const [coverMapRaw, headshotMapRaw] = await Promise.all([
    getCoverPhotosForSessions(sessionIds),
    getHeadshotsForPersons(allPersonIds),
  ]);
  const photoMap = Object.fromEntries(coverMapRaw);
  const headshotMap = Object.fromEntries(headshotMapRaw);

  const labelOptions = labels.map(({ id, name }) => ({ id, name }));
  const projectOptions = projects.map(({ id, name }) => ({ id, name }));

  const filterGroups: FilterGroup[] = [
    {
      type: "pill",
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "All" },
        { value: "DRAFT", label: "Draft", count: facetCounts.status["DRAFT"] ?? 0 },
        { value: "CONFIRMED", label: "Confirmed", count: facetCounts.status["CONFIRMED"] ?? 0 },
      ],
    },
    {
      type: "typeahead",
      param: "personId",
      displayParam: "personName",
      label: "Person",
      apiPath: "/api/people/search",
      inline: true,
    },
    // The person as a model by default; this takes in where they only appear (2026-10-24)
    ...(personId ? [{ type: "toggle" as const, param: "personSupport", label: "incl. appearing" }] : []),
    {
      type: "daterange",
      paramFrom: "dateFrom",
      paramTo: "dateTo",
      label: "Session Date",
    },
    {
      type: "daterange",
      paramFrom: "createdFrom",
      paramTo: "createdTo",
      label: "Added",
    },
  ];

  if (labelOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "label",
      label: "Label",
      options: labelOptions.map((l) => ({
        value: l.id,
        label: l.name,
        count: facetCounts.labelId[l.id],
      })),
      searchable: true,
    });
  }

  if (projectOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "project",
      label: "Project",
      options: projectOptions.map((p) => ({
        value: p.id,
        label: p.name,
        count: facetCounts.projectId[p.id],
      })),
      searchable: true,
    });
  }

  if (hasIntensity) {
    filterGroups.push({
      type: "facet",
      param: "intensity",
      label: "Intensity",
      options: intensityFilterOptions(intensityMax),
    });
    filterGroups.push({
      type: "facet",
      param: "rated",
      label: "Rated",
      options: [...RATED_FILTER_OPTIONS],
    });
  }

  filterGroups.push({
    type: "tags",
    param: "tags",
    entityType: "SESSION",
    facets: tagFacets,
    countNoun: "sessions",
    problems: tagFilter?.problems,
  });

  const toolbarConfig: BrowserToolbarConfig = {
    basePath: "/sessions",
    searchPlaceholder: "Search sessions…",
    sortOptions: SORT_OPTIONS,
    defaultSort: "newest",
    filterGroups,
    resultCount: paginated.items.length,
    totalCount: paginated.totalCount,
    browseContextKey: "pulseboard-session-browse-context",
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-entity-session/15">
            <Clapperboard size={20} className="text-entity-session" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Sessions</h1>
            <p className="text-sm text-muted-foreground">
              {paginated.totalCount} {paginated.totalCount === 1 ? "session" : "sessions"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasIntensity && (
            <Suspense>
              <RateTheseButton from="sessions" />
            </Suspense>
          )}
          <AddSessionSheet labels={labelOptions} projects={projectOptions} />
        </div>
      </div>

      {/* Saved views */}
      <Suspense>
        <SavedViewsBar scope="sessions" basePath="/sessions" views={await listSavedFilters("sessions")} legacyStorageKey="pulseboard-views-/sessions" />
      </Suspense>

      {/* Unified toolbar */}
      <Suspense>
        <BrowserToolbar config={toolbarConfig} />
      </Suspense>

      {/* Grid */}
      {/* A card's label, date parts and people filter the grid (pivots) */}
      <PivotScopeProvider dateFrom="dateFrom" dateTo="dateTo" valueParam="label" datePhrase="Sessions from">
        <SessionGrid
          key={JSON.stringify(filters)}
          sessions={paginated.items}
          photoMap={photoMap}
          headshotMap={headshotMap}
          nextCursor={paginated.nextCursor}
          totalCount={paginated.totalCount}
          filters={filters}
        />
      </PivotScopeProvider>
    </div>
    );
  });
}
