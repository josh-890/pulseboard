import { projects } from "@/lib/data/projects";
import type { Project, ProjectStatus } from "@/lib/types";

export function getProjects(): Project[] {
  return projects;
}

export function getProjectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function getProjectsByStatus(status: ProjectStatus): Project[] {
  return projects.filter((p) => p.status === status);
}

export function searchProjects(
  query: string,
  status?: ProjectStatus | "all",
): Project[] {
  const normalizedQuery = query.toLowerCase().trim();

  return projects.filter((p) => {
    const matchesStatus = !status || status === "all" || p.status === status;
    const matchesQuery =
      !normalizedQuery ||
      p.name.toLowerCase().includes(normalizedQuery) ||
      p.description.toLowerCase().includes(normalizedQuery) ||
      p.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

    return matchesStatus && matchesQuery;
  });
}
