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
        where: { label: { deletedAt: null } },
        include: { label: true },
      },
      sessions: {
        where: { deletedAt: null },
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
        where: { label: { deletedAt: null } },
        include: { label: true },
      },
      sessions: {
        where: { deletedAt: null },
        include: {
          participants: {
            include: {
              person: {
                include: {
                  aliases: { where: { type: "common", deletedAt: null }, take: 1 },
                },
              },
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
      description: data.description,
      status: data.status,
      tags: data.tags,
    },
  });
}

export async function deleteProjectRecord(id: string) {
  const deletedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Find non-deleted sessions
    const sessions = await tx.session.findMany({
      where: { projectId: id, deletedAt: null },
      select: { id: true },
    });

    // Cascade-delete each session (sets + contributions + photos)
    for (const session of sessions) {
      await cascadeDeleteSession(tx, session.id, deletedAt);
    }

    // Hard-delete join table rows (no deletedAt column)
    await tx.projectLabel.deleteMany({ where: { projectId: id } });

    // Soft-delete the project
    return tx.project.update({
      where: { id },
      data: { deletedAt },
    });
  });
}
