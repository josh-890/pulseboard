import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export async function getChannels(filters?: { q?: string; labelId?: string }) {
  const where: Prisma.ChannelWhereInput = {};

  if (filters?.q) {
    where.name = { contains: filters.q, mode: "insensitive" };
  }
  if (filters?.labelId) {
    where.labelMaps = { some: { labelId: filters.labelId } };
  }

  return prisma.channel.findMany({
    where,
    include: {
      labelMaps: { include: { label: true } },
      _count: {
        select: {
          sets: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getChannelById(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    include: {
      labelMaps: { include: { label: true } },
      sets: {
        where: { deletedAt: null },
        orderBy: { releaseDate: "desc" },
      },
    },
  });
}

export async function countChannels(): Promise<number> {
  return prisma.channel.count();
}

export async function createChannelRecord(data: {
  name: string;
  platform?: string;
  url?: string;
  labelId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.create({
      data: {
        name: data.name,
        platform: data.platform,
        url: data.url,
      },
    });

    // If a labelId was provided, create a ChannelLabelMap entry
    if (data.labelId) {
      await tx.channelLabelMap.create({
        data: {
          channelId: channel.id,
          labelId: data.labelId,
          confidence: 1.0,
        },
      });
    }

    return channel;
  });
}

export async function updateChannelRecord(
  id: string,
  data: {
    name?: string;
    platform?: string | null;
    url?: string | null;
    labelId?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.update({
      where: { id },
      data: {
        name: data.name,
        platform: data.platform,
        url: data.url,
      },
    });

    // Update primary label mapping if labelId changed
    if (data.labelId !== undefined) {
      // Remove existing mappings
      await tx.channelLabelMap.deleteMany({ where: { channelId: id } });

      // Add new mapping if provided
      if (data.labelId) {
        await tx.channelLabelMap.create({
          data: {
            channelId: id,
            labelId: data.labelId,
            confidence: 1.0,
          },
        });
      }
    }

    return channel;
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

    // Remove label mappings
    await tx.channelLabelMap.deleteMany({ where: { channelId: id } });

    // Soft-delete the channel
    return tx.channel.update({
      where: { id },
      data: { deletedAt },
    });
  });
}
