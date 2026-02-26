import { prisma } from "@/lib/db";

export async function getNetworks(q?: string) {
  return prisma.network.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      labelMemberships: {
        where: { label: { deletedAt: null } },
        include: {
          label: {
            include: {
              channelMaps: {
                include: {
                  channel: {
                    select: { id: true, deletedAt: true },
                  },
                },
              },
            },
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
        where: { label: { deletedAt: null } },
        include: {
          label: {
            include: {
              channelMaps: {
                include: {
                  channel: {
                    include: {
                      sets: {
                        where: { deletedAt: null },
                        select: { id: true, type: true },
                      },
                    },
                  },
                },
              },
              projects: {
                where: { project: { deletedAt: null } },
                include: { project: true },
              },
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

export async function createNetworkRecord(data: {
  name: string;
  description?: string;
  website?: string;
}) {
  return prisma.network.create({
    data: {
      name: data.name,
      description: data.description,
      website: data.website,
    },
  });
}

export async function updateNetworkRecord(id: string, data: {
  name?: string;
  description?: string | null;
  website?: string | null;
}) {
  return prisma.network.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      website: data.website,
    },
  });
}

export async function deleteNetworkRecord(id: string) {
  const deletedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Hard-delete join table rows (no deletedAt column)
    await tx.labelNetworkLink.deleteMany({ where: { networkId: id } });

    // Soft-delete the network
    return tx.network.update({
      where: { id },
      data: { deletedAt },
    });
  });
}
