import { Suspense } from "react";
import { Clapperboard } from "lucide-react";
import { getSessionsPaginated } from "@/lib/services/session-service";
import type { SessionSort } from "@/lib/services/session-service";
import { getCoverPhotosForSessions } from "@/lib/services/media-service";
import { getLabels } from "@/lib/services/label-service";
import { getProjects } from "@/lib/services/project-service";
import { SessionGrid } from "@/components/sessions/session-grid";
import { BrowserToolbar } from "@/components/shared/browser-toolbar";
import type { BrowserToolbarConfig, FilterGroup } from "@/components/shared/browser-toolbar";
import { AddSessionSheet } from "@/components/sessions/add-session-sheet";
import type { SessionStatus, SessionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_LOADED = 500;

type SessionsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    sort?: string;
    label?: string;
    project?: string;
    loaded?: string;
  }>;
};

const VALID_STATUSES = new Set<string>(["DRAFT", "CONFIRMED"]);
const VALID_TYPES = new Set<string>(["REFERENCE", "PRODUCTION"]);
const VALID_SORTS = new Set<string>([
  "newest", "date-desc", "date-asc", "name-asc", "media-desc",
]);

function isSessionSort(value: string): value is SessionSort {
  return VALID_SORTS.has(value);
}

const SORT_OPTIONS = [
  { value: "newest", label: "Recently created" },
  { value: "date-desc", label: "Session date (newest)" },
  { value: "date-asc", label: "Session date (oldest)" },
  { value: "name-asc", label: "Name A→Z" },
  { value: "media-desc", label: "Most media" },
];

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const {
    q, status, type, sort: sortParam,
    label: labelId, project: projectId,
    loaded,
  } = await searchParams;

  const limit = Math.min(
    Math.max(PAGE_SIZE, parseInt(loaded ?? "", 10) || PAGE_SIZE),
    MAX_LOADED,
  );

  const resolvedStatus = status && VALID_STATUSES.has(status) ? (status as SessionStatus) : undefined;
  const resolvedType = type && VALID_TYPES.has(type) ? (type as SessionType) : undefined;
  const resolvedSort = sortParam && isSessionSort(sortParam) ? sortParam : undefined;

  const filters = {
    q: q?.trim() || undefined,
    status: resolvedStatus ?? ("all" as const),
    type: resolvedType ?? ("all" as const),
    labelId: labelId || undefined,
    projectId: projectId || undefined,
    sort: resolvedSort,
  };

  const [paginated, labels, projects] = await Promise.all([
    getSessionsPaginated(filters, undefined, limit),
    getLabels(),
    getProjects(),
  ]);

  // Batch-load cover photos for sessions
  const sessionIds = paginated.items.map((s) => s.id);
  const coverMapRaw = await getCoverPhotosForSessions(sessionIds);
  const photoMap = Object.fromEntries(coverMapRaw);

  const labelOptions = labels.map(({ id, name }) => ({ id, name }));
  const projectOptions = projects.map(({ id, name }) => ({ id, name }));

  const filterGroups: FilterGroup[] = [
    {
      type: "pill",
      param: "type",
      label: "Type",
      options: [
        { value: "all", label: "All" },
        { value: "REFERENCE", label: "Reference" },
        { value: "PRODUCTION", label: "Production" },
      ],
    },
    {
      type: "pill",
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "All" },
        { value: "DRAFT", label: "Draft" },
        { value: "CONFIRMED", label: "Confirmed" },
      ],
    },
  ];

  if (labelOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "label",
      label: "Label",
      options: labelOptions.map((l) => ({ value: l.id, label: l.name })),
      searchable: true,
    });
  }

  if (projectOptions.length > 0) {
    filterGroups.push({
      type: "facet",
      param: "project",
      label: "Project",
      options: projectOptions.map((p) => ({ value: p.id, label: p.name })),
      searchable: true,
    });
  }

  const toolbarConfig: BrowserToolbarConfig = {
    basePath: "/sessions",
    searchPlaceholder: "Search sessions...",
    sortOptions: SORT_OPTIONS,
    defaultSort: "newest",
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
            <Clapperboard size={20} className="text-primary" />
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

      {/* Unified toolbar */}
      <Suspense>
        <BrowserToolbar config={toolbarConfig} />
      </Suspense>

      {/* Grid */}
      <SessionGrid
        sessions={paginated.items}
        photoMap={photoMap}
        nextCursor={paginated.nextCursor}
        totalCount={paginated.totalCount}
        filters={filters}
      />
    </div>
  );
}
