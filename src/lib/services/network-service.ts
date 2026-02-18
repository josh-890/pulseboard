import { prisma } from "@/lib/db";

export async function getNetworks(q?: string) {
  return prisma.network.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      labelMemberships: {
        include: {
          label: {
            include: { channels: { select: { id: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getNetworkById(id: string) {
  return prisma.network.findUnique({
    where: { id },
    include: {
      labelMemberships: {
        include: {
          label: {
            include: {
              channels: {
                include: {
                  sets: { select: { id: true, type: true } },
                },
              },
              projects: { include: { project: true } },
            },
          },
        },
      },
    },
  });
}

export async function countNetworks(): Promise<number> {
  return prisma.network.count();
}
