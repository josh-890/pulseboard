import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectSearch } from "@/components/projects/project-search";
import { StatusFilter } from "@/components/projects/status-filter";
import { ProjectList } from "@/components/projects/project-list";
import { searchProjects } from "@/lib/services/project-service";
import type { ProjectStatus } from "@/lib/types";

type ProjectsPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const { q, status } = await searchParams;
  const projects = await searchProjects(
    q ?? "",
    (status as ProjectStatus | "all") ?? "all",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold">Projects</h1>
        <Button asChild>
          <Link href="/projects/new">
            <Plus size={16} className="mr-1" />
            New Project
          </Link>
        </Button>
      </div>
      <Suspense fallback={null}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <ProjectSearch />
          </div>
          <StatusFilter />
        </div>
      </Suspense>
      <ProjectList projects={projects} />
    </div>
  );
}
