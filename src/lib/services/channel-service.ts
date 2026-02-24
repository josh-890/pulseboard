import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function getChannels(filters?: { q?: string; labelId?: string }) {
  const where: Prisma.ChannelWhereInput = {};

  if (filters?.q) {
    where.name = { contains: filters.q, mode: "insensitive" };
  }
  if (filters?.labelId) {
    where.labelId = filters.labelId;
  }

  return prisma.channel.findMany({
    where,
    include: {
      label: true,
      _count: {
        select: {
          sets: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ label: { name: "asc" } }, { name: "asc" }],
  });
}

export async function getChannelById(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    include: {
      label: true,
      sets: {
        where: { deletedAt: null },
        include: {
          session: {
            include: {
              project: true,
            },
          },
        },
        orderBy: { releaseDate: "desc" },
      },
    },
  });
}

export async function countChannels(): Promise<number> {
  return prisma.channel.count();
}

export async function createChannelRecord(data: {
  labelId: string;
  name: string;
  platform?: string;
  url?: string;
}) {
  return prisma.channel.create({
    data: {
      labelId: data.labelId,
      name: data.name,
      platform: data.platform,
      url: data.url,
    },
  });
}

export async function updateChannelRecord(
  id: string,
  data: {
    labelId?: string;
    name?: string;
    platform?: string | null;
    url?: string | null;
  },
) {
  return prisma.channel.update({
    where: { id },
    data: {
      labelId: data.labelId,
      name: data.name,
      platform: data.platform,
      url: data.url,
    },
  });
}

export async function deleteChannelRecord(id: string) {
  const deletedAt = new Date();

  return prisma.$transaction(async (tx) => {
    // Detach sets from channel (don't delete — sets survive channel deletion)
    await tx.set.updateMany({
      where: { channelId: id },
      data: { channelId: null },
    });

    // Soft-delete the channel
    return tx.channel.update({
      where: { id },
      data: { deletedAt },
    });
  });
}
