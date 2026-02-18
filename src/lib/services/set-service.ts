import { prisma } from "@/lib/db";
import type { Prisma, SetType } from "@/generated/prisma/client";

export type SetFilters = {
  q?: string;
  type?: SetType | "all";
  labelId?: string;
};

export async function getSets(filters: SetFilters = {}) {
  const { q, type, labelId } = filters;

  const where: Prisma.SetWhereInput = {};

  if (type && type !== "all") {
    where.type = type;
  }

  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  if (labelId) {
    where.channel = { labelId };
  }

  return prisma.set.findMany({
    where,
    include: {
      channel: { include: { label: true } },
      session: { include: { project: true } },
      contributions: {
        include: {
          person: {
            include: {
              aliases: { where: { isPrimary: true, deletedAt: null }, take: 1 },
            },
          },
        },
        orderBy: { role: "asc" },
        take: 5,
      },
    },
    orderBy: { releaseDate: "desc" },
  });
}

export async function getSetById(id: string) {
  return prisma.set.findUnique({
    where: { id },
    include: {
      channel: { include: { label: true } },
      session: { include: { project: true } },
      contributions: {
        include: {
          person: {
            include: {
              aliases: { where: { isPrimary: true, deletedAt: null }, take: 1 },
            },
          },
        },
        orderBy: { role: "asc" },
      },
    },
  });
}

export async function countSets(): Promise<number> {
  return prisma.set.count();
}
