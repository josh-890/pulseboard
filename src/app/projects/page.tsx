import { Suspense } from "react";
import { FolderKanban } from "lucide-react";
import { getProjects } from "@/lib/services/project-service";
import type { ProjectStatus } from "@/lib/types";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectSearch } from "@/components/projects/project-search";
import { StatusFilter } from "@/components/projects/status-filter";
import { AddProjectSheet } from "@/components/projects/add-project-sheet";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

const VALID_STATUSES = new Set<string>(["active", "paused", "completed"]);

function isProjectStatus(value: string): value is ProjectStatus {
  return VALID_STATUSES.has(value);
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const { q, status } = await searchParams;

  const resolvedStatus =
    status && isProjectStatus(status) ? status : undefined;

  const projects = await getProjects({
    q: q?.trim() || undefined,
    status: resolvedStatus ?? "all",
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <FolderKanban size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </p>
          </div>
        </div>
        <AddProjectSheet />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-full sm:max-w-xs">
          <Suspense>
            <ProjectSearch />
          </Suspense>
        </div>
        <Suspense>
          <StatusFilter />
        </Suspense>
      </div>

      {/* List */}
      <ProjectList projects={projects} />
    </div>
  );
}
