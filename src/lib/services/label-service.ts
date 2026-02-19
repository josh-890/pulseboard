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

export async function createLabelRecord(data: {
  name: string;
  description?: string;
  website?: string;
}) {
  return prisma.label.create({
    data: {
      name: data.name,
      description: data.description,
      website: data.website,
    },
  });
}

export async function updateLabelRecord(id: string, data: {
  name?: string;
  description?: string | null;
  website?: string | null;
}) {
  return prisma.label.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      website: data.website,
    },
  });
}

export async function deleteLabelRecord(id: string) {
  return prisma.label.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function createChannelRecord(
  labelId: string,
  data: { name: string; platform?: string; url?: string },
) {
  return prisma.channel.create({
    data: {
      labelId,
      name: data.name,
      platform: data.platform,
      url: data.url,
    },
  });
}
