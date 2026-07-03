import { prisma } from "@/lib/db";
import { normaliseAliasKey } from "@/lib/services/import/diff";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PersonAliasWithChannels = {
  id: string;
  name: string;
  isCommon: boolean;
  isBirth: boolean;
  source: "MANUAL" | "IMPORT";
  notes: string | null;
  creditCount: number;
  channelLinks: {
    channelId: string;
    channelName: string;
    isPrimary: boolean;
    notes: string | null;
    labelNames: string[];
    /** Sets on this channel credited under this alias (ADR-0024 corroboration). */
    setCount: number;
  }[];
};

export type BulkImportResult = {
  created: number;
  linked: number;
  unmatched: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

import { refreshStatusesForNameNorm } from '@/lib/services/import/participant-status-service'
import { normalizeForSearch } from '@/lib/normalize'

export { normalizeForSearch } from '@/lib/normalize'

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
              label: { select: { name: true } }, // owning Label (ADR-0020 FK)
            },
          },
        },
      },
      _count: {
        select: {
          creditUsages: true,
          sessionUsages: true,
        },
      },
    },
    orderBy: [{ isCommon: "desc" }, { isBirth: "desc" }, { name: "asc" }],
  });

  // Per-(alias, channel) set corroboration counts (ADR-0024).
  const aliasIds = aliases.map((a) => a.id);
  const setCountByAliasChannel = new Map<string, number>();
  if (aliasIds.length > 0) {
    const creditRows = await prisma.setCreditRaw.findMany({
      where: { resolvedAliasId: { in: aliasIds } },
      select: { resolvedAliasId: true, set: { select: { channelId: true } } },
    });
    for (const r of creditRows) {
      const channelId = r.set?.channelId;
      if (!r.resolvedAliasId || !channelId) continue;
      const key = `${r.resolvedAliasId}|${channelId}`;
      setCountByAliasChannel.set(key, (setCountByAliasChannel.get(key) ?? 0) + 1);
    }
  }

  return aliases.map((a) => ({
    id: a.id,
    name: a.name,
    isCommon: a.isCommon,
    isBirth: a.isBirth,
    source: a.source,
    notes: a.notes,
    creditCount: a._count.creditUsages + a._count.sessionUsages,
    channelLinks: a.channelLinks.map((cl) => ({
      channelId: cl.channelId,
      channelName: cl.channel.name,
      isPrimary: cl.isPrimary,
      notes: cl.notes,
      labelNames: cl.channel.label ? [cl.channel.label.name] : [],
      setCount: setCountByAliasChannel.get(`${a.id}|${cl.channelId}`) ?? 0,
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
                  label: { select: { name: true } }, // owning Label (ADR-0020 FK)
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
    creditCount: 0,
    channelLinks: l.alias.channelLinks.map((cl) => ({
      channelId: cl.channelId,
      channelName: cl.channel.name,
      isPrimary: cl.isPrimary,
      notes: cl.notes,
      labelNames: cl.channel.label ? [cl.channel.label.name] : [],
      setCount: 0, // corroboration counts are surfaced on the person view, not here
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

export type UpdateAliasResult =
  | { needsRenameConfirm: true; creditCount: number }
  | { needsRenameConfirm: false };

/**
 * Update an alias. Renaming an alias that is already used in sets is guarded
 * (ADR-0024): each Alias↔Channel fact is corroborated by real set usage, so a
 * rename is not assumed to be a typo fix. When the name changes and the alias
 * has usages, we return `needsRenameConfirm` WITHOUT writing — the caller then
 * offers "rename in place" (pass confirmRenameInPlace) or branch to a new alias
 * (see branchAliasToNew). Non-name edits are never guarded.
 */
export async function updateAlias(
  aliasId: string,
  data: {
    name?: string;
    isCommon?: boolean;
    isBirth?: boolean;
    notes?: string | null;
  },
  opts?: { confirmRenameInPlace?: boolean },
): Promise<UpdateAliasResult> {
  if (data.name !== undefined && !opts?.confirmRenameInPlace) {
    const alias = await prisma.personAlias.findUnique({
      where: { id: aliasId },
      select: {
        name: true,
        _count: { select: { creditUsages: true, sessionUsages: true } },
      },
    });
    if (alias && normalizeForSearch(alias.name) !== normalizeForSearch(data.name)) {
      const creditCount = alias._count.creditUsages + alias._count.sessionUsages;
      if (creditCount > 0) return { needsRenameConfirm: true, creditCount };
    }
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.nameNorm = normalizeForSearch(data.name);
  }
  if (data.isCommon !== undefined) updateData.isCommon = data.isCommon;
  if (data.isBirth !== undefined) updateData.isBirth = data.isBirth;
  if (data.notes !== undefined) updateData.notes = data.notes;

  await prisma.personAlias.update({ where: { id: aliasId }, data: updateData });
  return { needsRenameConfirm: false };
}

/**
 * Branch an in-use alias to a NEW alias (ADR-0024) instead of renaming in place.
 * The new alias copies the source's channel links (never as primary, to avoid a
 * duplicate primary) and leaves the source alias — and every set pinned to it —
 * untouched. This is the preferred resolution when a rename would otherwise
 * rewrite the credited name on historical sets.
 */
export async function branchAliasToNew(aliasId: string, newName: string) {
  return prisma.$transaction(async (tx) => {
    const source = await tx.personAlias.findUniqueOrThrow({
      where: { id: aliasId },
      select: {
        personId: true,
        channelLinks: { select: { channelId: true, notes: true } },
      },
    });
    const created = await tx.personAlias.create({
      data: {
        personId: source.personId,
        name: newName,
        nameNorm: normalizeForSearch(newName),
        source: "MANUAL",
      },
    });
    if (source.channelLinks.length > 0) {
      await tx.personAliasChannel.createMany({
        data: source.channelLinks.map((cl) => ({
          aliasId: created.id,
          channelId: cl.channelId,
          isPrimary: false,
          notes: cl.notes,
        })),
        skipDuplicates: true,
      });
    }
    return created;
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

    // ADR-0009 Phase 2: record the manual deletion so a future re-import can
    // surface "Previously manually deleted ..." next to the matching review
    // row instead of silently proposing to re-create the alias.
    await tx.itemDeletionTombstone.create({
      data: {
        personId: alias.personId,
        kind: "alias",
        itemKey: normaliseAliasKey(alias.name),
      },
    });
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

// ─── Alias promotion queue (ADR-0024) ───────────────────────────────────────
//
// Moment 2 of the capture loop: a per-set used-name (SetCreditRaw.rawName)
// becomes a registered, channel-scoped alias. The queue is DERIVED — it is a
// query over SetCreditRaw, not a stored candidate entity. Only rejections are
// stored (AliasPromotionDismissal). Evidence drives display already (raw string
// shows as "as X"); promotion just makes the alias queryable in the registry.

export type AliasPromotionCandidate = {
  personId: string;
  personName: string;
  channelId: string;
  channelName: string;
  name: string; // display form of the used-name (first-seen rawName)
  nameNorm: string;
  setCount: number;
};

// Minimal row shape consumed by the pure candidate builder (below).
export type QueueCreditRow = {
  resolvedPersonId: string | null;
  nameNorm: string | null;
  rawName: string;
  set: { channelId: string | null; channel: { name: string } | null } | null;
  resolvedPerson: {
    icgId: string;
    aliases: { nameNorm: string | null; isCommon: boolean; channelLinks: { channelId: string }[] }[];
  } | null;
};

/**
 * Pure grouping/exclusion for the promotion queue (ADR-0024) — extracted for
 * testability. Excludes the common name, used-names already linked as an alias
 * on the set's channel, and dismissed `person|channel|nameNorm` tuples. Groups
 * by (person, channel, nameNorm) with a set count. `personName` is left as the
 * icgId here; the caller resolves the common name.
 */
export function buildAliasPromotionCandidates(
  rows: QueueCreditRow[],
  dismissed: Set<string>,
): AliasPromotionCandidate[] {
  const groups = new Map<string, AliasPromotionCandidate>();
  for (const c of rows) {
    const pId = c.resolvedPersonId;
    const channelId = c.set?.channelId;
    const nameNorm = c.nameNorm;
    if (!pId || !channelId || !nameNorm || !c.resolvedPerson) continue;

    const commonNorm = c.resolvedPerson.aliases.find((a) => a.isCommon)?.nameNorm ?? null;
    if (nameNorm === commonNorm) continue; // credited under the common name

    const alreadyLinked = c.resolvedPerson.aliases.some(
      (a) => a.nameNorm === nameNorm && a.channelLinks.some((cl) => cl.channelId === channelId),
    );
    if (alreadyLinked) continue;

    if (dismissed.has(`${pId}|${channelId}|${nameNorm}`)) continue;

    const key = `${pId}|${channelId}|${nameNorm}`;
    const existing = groups.get(key);
    if (existing) {
      existing.setCount += 1;
    } else {
      groups.set(key, {
        personId: pId,
        personName: c.resolvedPerson.icgId, // caller resolves to the common name
        channelId,
        channelName: c.set?.channel?.name ?? "",
        name: c.rawName,
        nameNorm,
        setCount: 1,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.setCount - a.setCount);
}

/**
 * Derived promotion queue: resolved credits whose used-name is not yet a
 * registered alias on that set's channel. Excludes the common name, names
 * already linked as an alias on that channel, and dismissed tuples. Grouped by
 * (person, channel, nameNorm) with a set count. Pass `personId` to scope to one
 * person (the alias-tab surface); omit for the global maintenance sweep.
 */
export async function getAliasPromotionQueue(
  personId?: string,
): Promise<AliasPromotionCandidate[]> {
  const credits = await prisma.setCreditRaw.findMany({
    where: {
      resolvedPersonId: personId ?? { not: null },
      resolvedAliasId: null,
      nameNorm: { not: null },
      set: { channelId: { not: null } },
    },
    select: {
      rawName: true,
      nameNorm: true,
      resolvedPersonId: true,
      set: { select: { channelId: true, channel: { select: { name: true } } } },
      resolvedPerson: {
        select: {
          icgId: true,
          aliases: {
            select: {
              nameNorm: true,
              isCommon: true,
              channelLinks: { select: { channelId: true } },
            },
          },
        },
      },
    },
  });

  // Dismissals for the persons in scope.
  const dismissals = await prisma.aliasPromotionDismissal.findMany({
    where: personId ? { personId } : {},
    select: { personId: true, channelId: true, nameNorm: true },
  });
  const dismissed = new Set(
    dismissals.map((d) => `${d.personId}|${d.channelId}|${d.nameNorm}`),
  );

  const candidates = buildAliasPromotionCandidates(credits, dismissed);

  // personName is the icgId out of the builder — resolve to the common display
  // name in one extra pass for the persons in scope.
  const personIds = [...new Set(candidates.map((g) => g.personId))];
  if (personIds.length > 0) {
    const persons = await prisma.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, icgId: true, aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
    });
    const nameById = new Map(persons.map((p) => [p.id, p.aliases[0]?.name ?? p.icgId]));
    for (const g of candidates) g.personName = nameById.get(g.personId) ?? g.personName;
  }

  return candidates;
}

/**
 * Promote a used-name into a registered, channel-scoped alias and back-fill the
 * pin on every set that credited it (ADR-0024). Reuses an existing alias with
 * the same nameNorm for the person (linking it to the channel) rather than
 * creating a duplicate. Marks the channel link primary when the person has no
 * other alias on that channel yet.
 */
export async function promoteAliasFromQueue(
  personId: string,
  channelId: string,
  name: string,
) {
  const nameNorm = normalizeForSearch(name);
  await prisma.$transaction(async (tx) => {
    let alias = await tx.personAlias.findFirst({
      where: { personId, nameNorm },
      select: { id: true },
    });
    if (!alias) {
      alias = await tx.personAlias.create({
        data: { personId, name, nameNorm, source: "MANUAL" },
        select: { id: true },
      });
    }

    const existingOnChannel = await tx.personAliasChannel.findFirst({
      where: { channelId, alias: { personId } },
      select: { aliasId: true },
    });
    await tx.personAliasChannel.upsert({
      where: { aliasId_channelId: { aliasId: alias.id, channelId } },
      create: { aliasId: alias.id, channelId, isPrimary: !existingOnChannel },
      update: {},
    });

    // Back-fill the pin on every matching, not-yet-pinned credit on this channel.
    await tx.setCreditRaw.updateMany({
      where: {
        resolvedPersonId: personId,
        nameNorm,
        resolvedAliasId: null,
        set: { channelId },
      },
      data: { resolvedAliasId: alias.id },
    });
  });

  refreshStatusesForNameNorm(nameNorm).catch(() => {});
}

/** Reject a promotion candidate so it doesn't resurface (ADR-0024). */
export async function dismissAliasPromotion(
  personId: string,
  channelId: string,
  name: string,
) {
  const nameNorm = normalizeForSearch(name);
  await prisma.aliasPromotionDismissal.upsert({
    where: { personId_channelId_nameNorm: { personId, channelId, nameNorm } },
    create: { personId, channelId, nameNorm },
    update: {},
  });
}
