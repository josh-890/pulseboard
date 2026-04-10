import { prisma } from "@/lib/db";
import type { Prisma, ChannelTier } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { generateChannelShortName } from "@/lib/utils";
import { refreshPersonAffiliations } from "@/lib/services/view-service";

export async function getChannels(filters?: { q?: string; labelId?: string; tier?: ChannelTier[] }) {
  const where: Prisma.ChannelWhereInput = {};

  if (filters?.q) {
    where.name = { contains: filters.q, mode: "insensitive" };
  }
  if (filters?.labelId) {
    where.labelMaps = { some: { labelId: filters.labelId } };
  }
  if (filters?.tier?.length) {
    where.tier = { in: filters.tier };
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
  tier?: ChannelTier;
}) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.create({
      data: {
        name: data.name,
        nameNorm: normalizeForSearch(data.name),
        shortName: data.shortName || null,
        platform: data.platform,
        url: data.url,
        tier: data.tier,
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
    tier?: ChannelTier;
  },
) {
  let labelActuallyChanged = false;

  const channel = await prisma.$transaction(async (tx) => {
    const updated = await tx.channel.update({
      where: { id },
      data: {
        name: data.name,
        nameNorm: data.name ? normalizeForSearch(data.name) : undefined,
        shortName: data.shortName,
        platform: data.platform,
        url: data.url,
        tier: data.tier,
      },
    });

    if (data.labelId !== undefined) {
      // Read old label before replacing
      const oldMap = await tx.channelLabelMap.findFirst({
        where: { channelId: id },
        select: { labelId: true },
      });
      const oldLabelId = oldMap?.labelId ?? null;
      const newLabelId = data.labelId || null;

      // Replace ChannelLabelMap (existing behaviour)
      await tx.channelLabelMap.deleteMany({ where: { channelId: id } });
      if (newLabelId) {
        await tx.channelLabelMap.create({
          data: { channelId: id, labelId: newLabelId, confidence: 1.0 },
        });
      }

      if (oldLabelId !== newLabelId) {
        labelActuallyChanged = true;

        // Cascade Session.labelId — only for sessions whose sets all belong to this channel.
        // Guards against accidentally relabelling shared/compilation sessions.
        if (oldLabelId) {
          const setsInChannel = await tx.set.findMany({
            where: { channelId: id },
            select: { id: true },
          });
          const setIds = setsInChannel.map((s) => s.id);

          if (setIds.length > 0) {
            // Sessions that touch at least one set in this channel
            const channelLinks = await tx.setSession.findMany({
              where: { setId: { in: setIds } },
              select: { sessionId: true },
            });
            const candidateSessionIds = [...new Set(channelLinks.map((l) => l.sessionId))];

            // All set links for those sessions (detect cross-channel/compilation sessions)
            const allLinks = await tx.setSession.findMany({
              where: { sessionId: { in: candidateSessionIds } },
              select: { sessionId: true, setId: true },
            });
            const sessionSetMap = new Map<string, string[]>();
            for (const link of allLinks) {
              sessionSetMap.set(link.sessionId, [...(sessionSetMap.get(link.sessionId) ?? []), link.setId]);
            }

            // Keep only sessions where every linked set is in this channel
            const channelSetIds = new Set(setIds);
            const pureSessionIds = [...sessionSetMap.entries()]
              .filter(([, sids]) => sids.every((sid) => channelSetIds.has(sid)))
              .map(([sessionId]) => sessionId);

            if (pureSessionIds.length > 0) {
              await tx.session.updateMany({
                where: { id: { in: pureSessionIds }, labelId: oldLabelId },
                data: { labelId: newLabelId },
              });
            }
          }
        }
      }
    }

    return updated;
  });

  // Refresh materialized view outside the transaction (DDL-like op, must run after commit)
  if (labelActuallyChanged) {
    await refreshPersonAffiliations();
  }

  return channel;
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
