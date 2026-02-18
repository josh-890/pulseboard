import { prisma } from "@/lib/db";
import type { Prisma, ProjectStatus } from "@/generated/prisma/client";

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
      labels: { include: { label: true } },
      sessions: {
        include: {
          sets: { select: { id: true, type: true, title: true } },
        },
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
      labels: { include: { label: true } },
      sessions: {
        include: {
          sets: {
            include: {
              contributions: {
                include: {
                  person: {
                    include: {
                      aliases: { where: { isPrimary: true, deletedAt: null }, take: 1 },
                    },
                  },
                },
                take: 4,
              },
            },
            orderBy: { releaseDate: "desc" },
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
