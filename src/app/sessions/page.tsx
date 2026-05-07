import { withTenantFromHeaders } from "@/lib/tenant-context";
import { Suspense } from "react";
import { Clapperboard } from "lucide-react";
import { getSessionsPaginated, getSessionFacetCounts } from "@/lib/services/session-service";
import type { SessionSort } from "@/lib/services/session-service";
import { getCoverPhotosForSessions, getHeadshotsForPersons } from "@/lib/services/media-service";
import { getLabels } from "@/lib/services/label-service";
import { getProjects } from "@/lib/services/project-service";
import { SessionGrid } from "@/components/sessions/session-grid";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
import { SavedViewsBar } from "@/components/shared/saved-views-bar";
import { AddSessionSheet } from "@/components/sessions/add-session-sheet";
import type { SessionStatus } from "@/lib/types";

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
    dateFrom?: string;
    dateTo?: string;
    createdFrom?: string;
    createdTo?: string;
    loaded?: string;
  }>;
};

const VALID_STATUSES = new Set<string>(["DRAFT", "CONFIRMED"]);
const VALID_SORTS = new Set<string>([
  "newest", "date-desc", "date-asc", "name-asc", "name-desc",
  "media-desc", "updated", "contributors-desc", "sets-desc",
]);

function isSessionSort(value: string): value is SessionSort {
  return VALID_SORTS.has(value);
}

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

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  return withTenantFromHeaders(async () => {
    const {
      q, status, sort: sortParam,
      label: labelId, project: projectId,
      personId,
      dateFrom: dateFromParam, dateTo: dateToParam,
      createdFrom: createdFromParam, createdTo: createdToParam,
      loaded,
    } = await searchParams;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const resolvedStatus = status && VALID_STATUSES.has(status) ? (status as SessionStatus) : undefined;
  const resolvedSort = sortParam && isSessionSort(sortParam) ? sortParam : undefined;
  const dateFrom = parseDate(dateFromParam);
  const dateTo = parseDate(dateToParam);
  const createdFrom = parseDate(createdFromParam);
  const createdTo = parseDate(createdToParam);

  const filters = {
    q: q?.trim() || undefined,
    status: resolvedStatus ?? ("all" as const),
    type: "PRODUCTION" as const,
    labelId: labelId || undefined,
    projectId: projectId || undefined,
    personId: personId || undefined,
    dateFrom,
    dateTo,
    createdFrom,
    createdTo,
    sort: resolvedSort,
  };

  const [paginated, labels, projects, facetCounts] = await Promise.all([
    getSessionsPaginated(filters, undefined, limit),
    getLabels(),
    getProjects(),
    getSessionFacetCounts(filters),
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
    },
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
        <AddSessionSheet labels={labelOptions} projects={projectOptions} />
      </div>

      {/* Saved views */}
      <Suspense>
        <SavedViewsBar storageKey="pulseboard-views-/sessions" basePath="/sessions" />
      </Suspense>

      {/* Unified toolbar */}
      <Suspense>
        <BrowserToolbar config={toolbarConfig} />
      </Suspense>

      {/* Grid */}
      <SessionGrid
        key={JSON.stringify(filters)}
        sessions={paginated.items}
        photoMap={photoMap}
        headshotMap={headshotMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
      />
    </div>
    );
  });
}
