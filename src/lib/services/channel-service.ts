import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { generateChannelShortName } from "@/lib/utils";

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
          sets: true,
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
        orderBy: { releaseDate: "desc" },
      },
    },
  });
}

export async function removeChannelImportAlias(channelId: string, alias: string) {
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: { importAliases: true },
  })
  return prisma.channel.update({
    where: { id: channelId },
    data: {
      importAliases: channel.importAliases.filter((a) => a !== alias),
    },
  })
}

export async function countChannels(): Promise<number> {
  return prisma.channel.count();
}

export async function createChannelRecord(data: {
  name: string;
  shortName?: string;
  platform?: string;
  url?: string;
  labelId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.create({
      data: {
        name: data.name,
        nameNorm: data.name.toLowerCase(),
        shortName: data.shortName || null,
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
    shortName?: string | null;
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
        nameNorm: data.name ? data.name.toLowerCase() : undefined,
        shortName: data.shortName,
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
  return prisma.$transaction(async (tx) => {
    // Detach sets from channel (don't delete — sets survive channel deletion)
    await tx.set.updateMany({
      where: { channelId: id },
      data: { channelId: null },
    });

    // Remove alias-channel links (no schema cascade)
    await tx.personAliasChannel.deleteMany({ where: { channelId: id } });

    // Remove label mappings
    await tx.channelLabelMap.deleteMany({ where: { channelId: id } });

    return tx.channel.delete({
      where: { id },
    });
  });
}

/** Add an import alias to a channel (idempotent) */
export async function addChannelImportAlias(channelId: string, alias: string) {
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: { importAliases: true },
  })

  if (channel.importAliases.includes(alias)) return // already exists

  return prisma.channel.update({
    where: { id: channelId },
    data: {
      importAliases: { push: alias },
    },
  })
}

/** Search channels by name for the resolution UI */
export async function searchChannelsForResolution(query: string) {
  return prisma.channel.findMany({
    where: {
      name: { contains: query, mode: 'insensitive' },
    },
    select: {
      id: true,
      name: true,
      labelMaps: {
        select: { label: { select: { name: true } } },
        take: 1,
      },
    },
    take: 20,
    orderBy: { name: 'asc' },
  })
}

/** Check if a shortName is available (optionally excluding a specific channel) */
export async function isShortNameAvailable(
  shortName: string,
  excludeChannelId?: string,
): Promise<boolean> {
  const existing = await prisma.channel.findUnique({
    where: { shortName },
    select: { id: true },
  })
  if (!existing) return true
  return excludeChannelId ? existing.id === excludeChannelId : false
}

/** Generate a unique shortName suggestion for a channel name */
export async function suggestUniqueShortName(
  channelName: string,
  excludeChannelId?: string,
): Promise<string> {
  const base = generateChannelShortName(channelName)
  if (!base) return ""

  // Check if base is available
  if (await isShortNameAvailable(base, excludeChannelId)) return base

  // Try appending digits: FJ2, FJ3, ...
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}${i}`
    if (await isShortNameAvailable(candidate, excludeChannelId)) return candidate
  }

  return base // unlikely fallback
}
