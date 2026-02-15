import { ProjectList } from "./project-list";
import { searchProjects } from "@/lib/services/project-service";
import type { ProjectStatus } from "@/lib/types";

type ProjectResultsProps = {
  q: string;
  status: ProjectStatus | "all";
};

export async function ProjectResults({ q, status }: ProjectResultsProps) {
  const projects = await searchProjects(q, status);

  return <ProjectList projects={projects} />;
}
