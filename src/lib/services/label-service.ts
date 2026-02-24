import { prisma } from "@/lib/db";

export async function getLabels(q?: string) {
  return prisma.label.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      channels: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      },
      networks: {
        where: { network: { deletedAt: null } },
        include: { network: true },
      },
      projects: {
        where: { project: { deletedAt: null } },
        include: { project: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getLabelById(id: string) {
  return prisma.label.findUnique({
    where: { id },
    include: {
      channels: {
        where: { deletedAt: null },
        include: {
          sets: {
            where: { deletedAt: null },
            orderBy: { releaseDate: "desc" },
            take: 10,
          },
        },
        orderBy: { name: "asc" },
      },
      networks: {
        where: { network: { deletedAt: null } },
        include: { network: true },
      },
      projects: {
        where: { project: { deletedAt: null } },
        include: {
          project: {
            include: {
              sessions: {
                where: { deletedAt: null },
                include: {
                  sets: {
                    where: { deletedAt: null },
                    select: { id: true, type: true },
                  },
                },
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
  const deletedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Find non-deleted channels
    const channels = await tx.channel.findMany({
      where: { labelId: id, deletedAt: null },
      select: { id: true },
    });

    // Detach sets from channels (don't delete — sets survive label deletion)
    for (const channel of channels) {
      await tx.set.updateMany({
        where: { channelId: channel.id },
        data: { channelId: null },
      });
    }

    // Soft-delete channels
    await tx.channel.updateMany({
      where: { labelId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Hard-delete join table rows (no deletedAt column)
    await tx.labelNetwork.deleteMany({ where: { labelId: id } });
    await tx.projectLabel.deleteMany({ where: { labelId: id } });

    // Soft-delete the label
    return tx.label.update({
      where: { id },
      data: { deletedAt },
    });
  });
}

