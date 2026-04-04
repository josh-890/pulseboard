import { prisma } from "@/lib/db";
import type { Prisma, ProjectStatus } from "@/generated/prisma/client";
import { cascadeDeleteSession } from "./cascade-helpers";

export type ProjectFilters = {
  q?: string;
  status?: ProjectStatus | "all";
};

export async function getProjects(filters: ProjectFilters = {}) {
  const { q, status } = filters;

  const where: Prisma.ProjectWhereInput = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  return prisma.project.findMany({
    where,
    include: {
      labels: {
        include: { label: true },
      },
      sessions: {
        orderBy: { date: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getProjectById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      labels: {
        include: { label: true },
      },
      projectTags: {
        include: {
          tagDefinition: {
            include: {
              group: { select: { id: true, name: true, slug: true, color: true } },
            },
          },
        },
      },
      sessions: {
        include: {
          contributions: {
            include: {
              person: {
                include: {
                  aliases: { where: { isCommon: true }, take: 1 },
                },
              },
              roleDefinition: true,
            },
          },
        },
        orderBy: { date: "desc" },
      },
    },
  });
}

export async function countProjects(): Promise<number> {
  return prisma.project.count();
}

export async function createProjectRecord(data: {
  name: string;
  description?: string;
  status?: ProjectStatus;
  tags?: string[];
}) {
  return prisma.project.create({
    data: {
      name: data.name,
      nameNorm: data.name.toLowerCase(),
      description: data.description,
      status: data.status ?? "active",
      tags: data.tags ?? [],
    },
  });
}

export async function updateProjectRecord(id: string, data: {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  tags?: string[];
}) {
  return prisma.project.update({
    where: { id },
    data: {
      name: data.name,
      nameNorm: data.name ? data.name.toLowerCase() : undefined,
      description: data.description,
      status: data.status,
      tags: data.tags,
    },
  });
}

export async function deleteProjectRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    // Find sessions belonging to this project
    const sessions = await tx.session.findMany({
      where: { projectId: id },
      select: { id: true },
    });

    // Cascade-delete each session
    for (const session of sessions) {
      await cascadeDeleteSession(tx, session.id);
    }

    // Delete join table rows
    await tx.projectLabel.deleteMany({ where: { projectId: id } });

    // Delete the project
    return tx.project.delete({
      where: { id },
    });
  });
}
