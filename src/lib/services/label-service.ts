import { prisma } from "@/lib/db";

export async function getLabels(q?: string) {
  return prisma.label.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      channelMaps: {
        include: {
          channel: {
            select: { id: true, name: true, deletedAt: true },
          },
        },
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
      channelMaps: {
        include: {
          channel: {
            include: {
              sets: {
                where: { deletedAt: null },
                orderBy: { releaseDate: "desc" },
                take: 10,
              },
            },
          },
        },
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
    // Remove channel label mappings for this label
    await tx.channelLabelMap.deleteMany({ where: { labelId: id } });

    // Remove set label evidence for this label
    await tx.setLabelEvidence.deleteMany({ where: { labelId: id } });

    // Hard-delete join table rows (no deletedAt column)
    await tx.labelNetworkLink.deleteMany({ where: { labelId: id } });
    await tx.projectLabel.deleteMany({ where: { labelId: id } });

    // Soft-delete the label
    return tx.label.update({
      where: { id },
      data: { deletedAt },
    });
  });
}

