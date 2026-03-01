import { Suspense } from "react";
import { Clapperboard } from "lucide-react";
import { getSessions } from "@/lib/services/session-service";
import { getLabels } from "@/lib/services/label-service";
import { getProjects } from "@/lib/services/project-service";
import { SessionGrid } from "@/components/sessions/session-grid";
import { SessionSearch } from "@/components/sessions/session-search";
import { SessionStatusFilter } from "@/components/sessions/session-status-filter";
import { SessionTypeFilter } from "@/components/sessions/session-type-filter";
import { AddSessionSheet } from "@/components/sessions/add-session-sheet";
import type { SessionStatus, SessionType } from "@/lib/types";

export const dynamic = "force-dynamic";

type SessionsPageProps = {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
};

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const { q, status, type } = await searchParams;

  const [sessions, labels, projects] = await Promise.all([
    getSessions({
      q: q?.trim() || undefined,
      status: (status as SessionStatus) || undefined,
      type: (type as SessionType) || undefined,
    }),
    getLabels(),
    getProjects(),
  ]);

  const labelOptions = labels.map(({ id, name }) => ({ id, name }));
  const projectOptions = projects.map(({ id, name }) => ({ id, name }));

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
              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            </p>
          </div>
        </div>
        <AddSessionSheet labels={labelOptions} projects={projectOptions} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <SessionSearch />
          </Suspense>
        </div>
        <Suspense>
          <SessionTypeFilter />
        </Suspense>
        <Suspense>
          <SessionStatusFilter />
        </Suspense>
      </div>

      {/* Grid */}
      <SessionGrid sessions={sessions} />
    </div>
  );
}
