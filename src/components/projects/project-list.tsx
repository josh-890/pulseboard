import { FolderKanban } from "lucide-react";
import { ProjectCard } from "./project-card";
import type { getProjects } from "@/lib/services/project-service";

type ProjectListProps = {
  projects: Awaited<ReturnType<typeof getProjects>>;
};

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderKanban size={48} className="mb-3 text-muted-foreground/30" />
        <p className="text-muted-foreground">No projects found.</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Try adjusting your search or filters.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
