import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";

export async function getLabels(q?: string) {
  return prisma.label.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      channelMaps: {
        include: {
          channel: {
            select: { id: true, name: true },
          },
        },
      },
      networks: {
        include: { network: true },
      },
      projects: {
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
                orderBy: { releaseDate: "desc" },
                take: 10,
              },
              _count: { select: { sets: true } },
            },
          },
        },
      },
      networks: {
        include: { network: true },
      },
      projects: {
        include: {
          project: {
            include: {
              sessions: true,
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
      nameNorm: normalizeForSearch(data.name),
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
      nameNorm: data.name ? normalizeForSearch(data.name) : undefined,
      description: data.description,
      website: data.website,
    },
  });
}

export async function deleteLabelRecord(id: string) {
  return prisma.$transaction(async (tx) => {
    // NULL primary label ref on projects and sessions (no schema cascade)
    await tx.project.updateMany({
      where: { labelId: id },
      data: { labelId: null },
    });
    await tx.session.updateMany({
      where: { labelId: id },
      data: { labelId: null },
    });

    await tx.channelLabelMap.deleteMany({ where: { labelId: id } });
    await tx.setLabelEvidence.deleteMany({ where: { labelId: id } });
    await tx.labelNetworkLink.deleteMany({ where: { labelId: id } });
    await tx.projectLabel.deleteMany({ where: { labelId: id } });

    return tx.label.delete({
      where: { id },
    });
  });
}

