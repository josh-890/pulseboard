import { prisma } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PersonAliasWithChannels = {
  id: string;
  name: string;
  isCommon: boolean;
  isBirth: boolean;
  source: "MANUAL" | "IMPORT";
  notes: string | null;
  channelLinks: {
    channelId: string;
    channelName: string;
    isPrimary: boolean;
    notes: string | null;
    labelNames: string[];
  }[];
};

export type BulkImportResult = {
  created: number;
  linked: number;
  unmatched: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

import { refreshStatusesForNameNorm } from '@/lib/services/import/participant-status-service'

export function normalizeForSearch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getPersonAliases(
  personId: string,
): Promise<PersonAliasWithChannels[]> {
  const aliases = await prisma.personAlias.findMany({
    where: { personId },
    include: {
      channelLinks: {
        include: {
          channel: {
            include: {
              labelMaps: {
                include: {
                  label: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ isCommon: "desc" }, { isBirth: "desc" }, { name: "asc" }],
  });

  return aliases.map((a) => ({
    id: a.id,
    name: a.name,
    isCommon: a.isCommon,
    isBirth: a.isBirth,
    source: a.source,
    notes: a.notes,
    channelLinks: a.channelLinks.map((cl) => ({
      channelId: cl.channelId,
      channelName: cl.channel.name,
      isPrimary: cl.isPrimary,
      notes: cl.notes,
      labelNames: cl.channel.labelMaps.map((lm) => lm.label.name),
    })),
  }));
}

export async function getChannelAliases(
  channelId: string,
): Promise<PersonAliasWithChannels[]> {
  const links = await prisma.personAliasChannel.findMany({
    where: { channelId },
    include: {
      alias: {
        include: {
          channelLinks: {
            include: {
              channel: {
                include: {
                  labelMaps: {
                    include: {
                      label: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return links.map((l) => ({
    id: l.alias.id,
    name: l.alias.name,
    isCommon: l.alias.isCommon,
    isBirth: l.alias.isBirth,
    source: l.alias.source,
    notes: l.alias.notes,
    channelLinks: l.alias.channelLinks.map((cl) => ({
      channelId: cl.channelId,
      channelName: cl.channel.name,
      isPrimary: cl.isPrimary,
      notes: cl.notes,
      labelNames: cl.channel.labelMaps.map((lm) => lm.label.name),
    })),
  }));
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createAlias(
  personId: string,
  name: string,
  isCommon: boolean = false,
  isBirth: boolean = false,
  source: "MANUAL" | "IMPORT" = "MANUAL",
  notes?: string | null,
  channelIds?: string[],
) {
  const result = await prisma.$transaction(async (tx) => {
    const alias = await tx.personAlias.create({
      data: {
        personId,
        name,
        isCommon,
        isBirth,
        source,
        notes: notes ?? null,
        nameNorm: normalizeForSearch(name),
      },
    });

    if (channelIds && channelIds.length > 0) {
      await tx.personAliasChannel.createMany({
        data: channelIds.map((channelId) => ({
          aliasId: alias.id,
          channelId,
        })),
        skipDuplicates: true,
      });
    }

    return alias;
  });

  // Refresh participant statuses on staging sets that match this alias name
  refreshStatusesForNameNorm(normalizeForSearch(name)).catch(() => {});

  return result;
}

export async function updateAlias(
  aliasId: string,
  data: {
    name?: string;
    isCommon?: boolean;
    isBirth?: boolean;
    notes?: string | null;
  },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.nameNorm = normalizeForSearch(data.name);
  }
  if (data.isCommon !== undefined) updateData.isCommon = data.isCommon;
  if (data.isBirth !== undefined) updateData.isBirth = data.isBirth;
  if (data.notes !== undefined) updateData.notes = data.notes;

  return prisma.personAlias.update({
    where: { id: aliasId },
    data: updateData,
  });
}

export async function deleteAlias(aliasId: string) {
  return prisma.$transaction(async (tx) => {
    // Guard: cannot delete the sole common alias (inside tx to avoid TOCTOU)
    const alias = await tx.personAlias.findUniqueOrThrow({
      where: { id: aliasId },
    });

    if (alias.isCommon) {
      throw new Error("Cannot delete the common alias. Assign another alias as the common name first.");
    }

    await tx.personAliasChannel.deleteMany({ where: { aliasId } });
    await tx.personAlias.delete({ where: { id: aliasId } });
  });
}

// ─── Channel Link Management ────────────────────────────────────────────────

export async function linkAliasToChannels(
  aliasId: string,
  channelIds: string[],
) {
  if (channelIds.length === 0) return;
  await prisma.personAliasChannel.createMany({
    data: channelIds.map((channelId) => ({
      aliasId,
      channelId,
    })),
    skipDuplicates: true,
  });
}

export async function unlinkAliasFromChannel(
  aliasId: string,
  channelId: string,
) {
  await prisma.personAliasChannel.delete({
    where: { aliasId_channelId: { aliasId, channelId } },
  });
}

export async function setAliasChannelPrimary(
  aliasId: string,
  channelId: string,
  isPrimary: boolean,
) {
  await prisma.personAliasChannel.update({
    where: { aliasId_channelId: { aliasId, channelId } },
    data: { isPrimary },
  });
}

// ─── Bulk Import ────────────────────────────────────────────────────────────

export async function bulkImportAliases(
  personId: string,
  entries: { name: string; channelName?: string }[],
): Promise<BulkImportResult> {
  const result: BulkImportResult = { created: 0, linked: 0, unmatched: [] };

  // Pre-fetch existing aliases for this person (for dedup)
  const existingAliases = await prisma.personAlias.findMany({
    where: { personId },
    select: { id: true, nameNorm: true },
  });
  const existingNormMap = new Map(
    existingAliases.map((a) => [a.nameNorm ?? "", a.id]),
  );

  // Pre-fetch all channels for fuzzy matching
  const allChannels = await prisma.channel.findMany({
    select: { id: true, name: true, nameNorm: true },
  });

  return prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const nameNorm = normalizeForSearch(entry.name);
      let aliasId = existingNormMap.get(nameNorm);

      // Create alias if it doesn't exist
      if (!aliasId) {
        const newAlias = await tx.personAlias.create({
          data: {
            personId,
            name: entry.name,
            isCommon: false,
            isBirth: false,
            source: "IMPORT",
            nameNorm,
          },
        });
        aliasId = newAlias.id;
        existingNormMap.set(nameNorm, aliasId);
        result.created++;
      }

      // Link to channel if provided
      if (entry.channelName) {
        const channelNorm = normalizeForSearch(entry.channelName);
        const matched = allChannels.find(
          (c) =>
            (c.nameNorm ?? "").toLowerCase() === channelNorm ||
            c.name.toLowerCase() === entry.channelName!.toLowerCase(),
        );

        if (matched) {
          await tx.personAliasChannel.createMany({
            data: [{ aliasId, channelId: matched.id }],
            skipDuplicates: true,
          });
          result.linked++;
        } else {
          result.unmatched.push(entry.channelName);
        }
      }
    }
    return result;
  });
}

// ─── Merge ──────────────────────────────────────────────────────────────────

export async function mergeAliases(
  targetAliasId: string,
  sourceAliasIds: string[],
) {
  if (sourceAliasIds.length === 0) return;

  return prisma.$transaction(async (tx) => {
    // Get existing target channel links to avoid duplicates
    const existingLinks = await tx.personAliasChannel.findMany({
      where: { aliasId: targetAliasId },
      select: { channelId: true },
    });
    const existingChannelIds = new Set(existingLinks.map((l) => l.channelId));

    // Transfer channel links from each source to target
    for (const sourceId of sourceAliasIds) {
      const sourceLinks = await tx.personAliasChannel.findMany({
        where: { aliasId: sourceId },
      });

      const newLinks = sourceLinks.filter(
        (l) => !existingChannelIds.has(l.channelId),
      );

      if (newLinks.length > 0) {
        await tx.personAliasChannel.createMany({
          data: newLinks.map((l) => ({
            aliasId: targetAliasId,
            channelId: l.channelId,
            isPrimary: l.isPrimary,
            notes: l.notes,
          })),
          skipDuplicates: true,
        });
        for (const l of newLinks) existingChannelIds.add(l.channelId);
      }

      // Delete source channel links then alias
      await tx.personAliasChannel.deleteMany({ where: { aliasId: sourceId } });
      await tx.personAlias.delete({ where: { id: sourceId } });
    }
  });
}
