import { prisma } from "@/lib/db";
import type { Project, ProjectStatus } from "@/lib/types";

export async function getProjects(): Promise<Project[]> {
  return prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getProjectById(id: string): Promise<Project | null> {
  return prisma.project.findUnique({ where: { id } });
}

export async function getProjectsByStatus(
  status: ProjectStatus,
): Promise<Project[]> {
  return prisma.project.findMany({ where: { status } });
}

export async function searchProjects(
  query: string,
  status?: ProjectStatus | "all",
): Promise<Project[]> {
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const statusFilter =
    status && status !== "all" ? { status } : {};

  if (!normalizedQuery) {
    return prisma.project.findMany({
      where: statusFilter,
      orderBy: { updatedAt: "desc" },
    });
  }

  const titleCaseQuery =
    normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1);

  return prisma.project.findMany({
    where: {
      ...statusFilter,
      OR: [
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { description: { contains: normalizedQuery, mode: "insensitive" } },
        {
          tags: {
            hasSome: [normalizedQuery, trimmedQuery, titleCaseQuery],
          },
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
}
