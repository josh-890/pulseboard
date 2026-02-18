import { prisma } from "@/lib/db";

export async function getLabels(q?: string) {
  return prisma.label.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      channels: { orderBy: { name: "asc" } },
      networks: { include: { network: true } },
      projects: { include: { project: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getLabelById(id: string) {
  return prisma.label.findUnique({
    where: { id },
    include: {
      channels: {
        include: {
          sets: {
            orderBy: { releaseDate: "desc" },
            take: 10,
          },
        },
        orderBy: { name: "asc" },
      },
      networks: { include: { network: true } },
      projects: {
        include: {
          project: {
            include: {
              sessions: {
                include: { sets: { select: { id: true, type: true } } },
              },
            },
          },
        },
      },
    },
  });
}

export async function countLabels(): Promise<number> {
  return prisma.label.count();
}
