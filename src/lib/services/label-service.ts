import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import { syncChannelOwnerLabel } from "@/lib/services/channel-service";
import { Prisma } from "@/generated/prisma/client";
import type { ChannelTier } from "@/generated/prisma/client";
import { BRAND_SELECT, brandOf } from "@/lib/services/brand-of";
import type { EntityBrand } from "@/lib/brand-mark";

export async function getLabels(q?: string) {
  return prisma.label.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      projects: { select: { projectId: true } },
      // The channels it owns (ADR-0020) — not every channel with a label map to it
      _count: { select: { ownedChannels: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getLabelById(id: string) {
  return prisma.label.findUnique({
    where: { id },
    include: {
      projects: {
        include: { project: { select: { id: true, name: true, status: true } } },
      },
      _count: { select: { ownedChannels: true } },
    },
  });
}

// ─── Label page (2026-11-08) ─────────────────────────────────────────────────

export type LabelHeroStats = {
  channels: number;
  photoSets: number;
  videoSets: number;
  /** Persons leading at least one set of its channels */
  models: number;
  firstYear: number | null;
  lastYear: number | null;
};

/** The numbers the label hero shows — over the channels it owns (ADR-0020) */
export async function getLabelHeroStats(labelId: string): Promise<LabelHeroStats> {
  const [row] = await prisma.$queryRaw<
    Array<{ channels: bigint; photo: bigint; video: bigint; models: bigint; first: Date | null; last: Date | null }>
  >(Prisma.sql`
    WITH ch AS (SELECT id FROM "Channel" WHERE "labelId" = ${labelId}),
    dates AS (
      SELECT "releaseDate" AS d FROM "Set" WHERE "channelId" IN (SELECT id FROM ch) AND "releaseDate" IS NOT NULL
      UNION ALL
      SELECT "releaseDate" FROM staging_set WHERE "channelId" IN (SELECT id FROM ch) AND "releaseDate" IS NOT NULL
    )
    SELECT
      (SELECT count(*) FROM ch) AS channels,
      (SELECT count(*) FROM "Set" WHERE "channelId" IN (SELECT id FROM ch) AND type = 'photo') AS photo,
      (SELECT count(*) FROM "Set" WHERE "channelId" IN (SELECT id FROM ch) AND type = 'video') AS video,
      (SELECT count(DISTINCT sp."personId")
         FROM "SetParticipant" sp
         JOIN "Set" s ON s.id = sp."setId"
         JOIN "ContributionRoleDefinition" rd ON rd.id = sp."roleDefinitionId"
         JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
        WHERE s."channelId" IN (SELECT id FROM ch) AND rg.kind = 'ON_CAMERA' AND rd.presence = 'LEAD') AS models,
      (SELECT min(d) FROM dates) AS first,
      (SELECT max(d) FROM dates) AS last
  `);
  return {
    channels: Number(row?.channels ?? 0),
    photoSets: Number(row?.photo ?? 0),
    videoSets: Number(row?.video ?? 0),
    models: Number(row?.models ?? 0),
    firstYear: row?.first ? row.first.getUTCFullYear() : null,
    lastYear: row?.last ? row.last.getUTCFullYear() : null,
  };
}

export type LabelChannelTile = {
  id: string;
  brand: EntityBrand;
  tier: ChannelTier;
  rating: number | null;
  closed: boolean;
  sets: number;
  photoSets: number;
  videoSets: number;
  /** Staged, not yet promoted */
  staged: number;
  firstYear: number | null;
  lastYear: number | null;
};

/** The channels a label owns, most sets first — the Channels tab */
export async function getLabelChannels(labelId: string): Promise<LabelChannelTile[]> {
  const channels = await prisma.channel.findMany({
    where: { labelId },
    select: { id: true, name: true, shortName: true, tier: true, rating: true, closed: true, ...BRAND_SELECT },
  });
  if (channels.length === 0) return [];
  const ids = channels.map((c) => c.id);
  const stats = await prisma.$queryRaw<
    Array<{ id: string; photo: bigint; video: bigint; staged: bigint; first: Date | null; last: Date | null }>
  >(Prisma.sql`
    SELECT c.id,
      (SELECT count(*) FROM "Set" s WHERE s."channelId" = c.id AND s.type = 'photo') AS photo,
      (SELECT count(*) FROM "Set" s WHERE s."channelId" = c.id AND s.type = 'video') AS video,
      (SELECT count(*) FROM staging_set st WHERE st."channelId" = c.id AND st.status IN ('PENDING', 'REVIEWING', 'APPROVED')) AS staged,
      (SELECT min(d) FROM (SELECT "releaseDate" d FROM "Set" WHERE "channelId" = c.id
                           UNION ALL SELECT "releaseDate" FROM staging_set WHERE "channelId" = c.id) x) AS first,
      (SELECT max(d) FROM (SELECT "releaseDate" d FROM "Set" WHERE "channelId" = c.id
                           UNION ALL SELECT "releaseDate" FROM staging_set WHERE "channelId" = c.id) x) AS last
    FROM "Channel" c WHERE c.id = ANY(${ids}::text[])
  `);
  const byId = new Map(stats.map((r) => [r.id, r]));
  return channels
    .map((c) => {
      const r = byId.get(c.id);
      const photoSets = Number(r?.photo ?? 0);
      const videoSets = Number(r?.video ?? 0);
      return {
        id: c.id,
        brand: brandOf(c),
        tier: c.tier,
        rating: c.rating,
        closed: c.closed,
        sets: photoSets + videoSets,
        photoSets,
        videoSets,
        staged: Number(r?.staged ?? 0),
        firstYear: r?.first ? r.first.getUTCFullYear() : null,
        lastYear: r?.last ? r.last.getUTCFullYear() : null,
      };
    })
    .sort((a, b) => b.sets - a.sets || b.staged - a.staged || a.brand.name.localeCompare(b.brand.name));
}

/** Your liking, 1–5; null clears it */
export async function setLabelRating(labelId: string, rating: number | null): Promise<void> {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("A rating is 1 to 5");
  }
  await prisma.label.update({ where: { id: labelId }, data: { rating } });
}

/** About (the description) or notes; blank clears it */
export async function setLabelText(labelId: string, field: "description" | "notes", text: string): Promise<void> {
  const value = text.trim() ? text.trim() : null;
  await prisma.label.update({ where: { id: labelId }, data: { [field]: value } });
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
    // ADR-0025 lifecycle guard: a Label is deletable only when it neither owns any
    // channel nor produces any session. Otherwise deleting it would silently orphan
    // those sessions' Producer link. Block with a clear, actionable message instead.
    const [ownedChannels, producedSessions] = await Promise.all([
      tx.channel.count({ where: { labelId: id } }),
      tx.session.count({ where: { labelId: id } }),
    ]);
    if (ownedChannels > 0 || producedSessions > 0) {
      const parts: string[] = [];
      if (ownedChannels > 0) parts.push(`owns ${ownedChannels} channel${ownedChannels === 1 ? "" : "s"}`);
      if (producedSessions > 0) parts.push(`produces ${producedSessions} session${producedSessions === 1 ? "" : "s"}`);
      throw new Error(
        `Cannot delete this label: it ${parts.join(" and ")}. Reassign or re-point them first.`,
      );
    }

    // NULL primary label ref on projects (not part of the producer model; sessions
    // are guarded above so none remain to null).
    await tx.project.updateMany({
      where: { labelId: id },
      data: { labelId: null },
    });

    // ADR-0020: capture channels mapped to this label so we can recompute their
    // owning-label FK after the maps are gone (a surviving secondary map becomes
    // the new owner; the FK's ON DELETE SET NULL only covers the no-map case).
    const affected = await tx.channelLabelMap.findMany({
      where: { labelId: id },
      select: { channelId: true },
    });
    const affectedChannelIds = [...new Set(affected.map((m) => m.channelId))];

    await tx.channelLabelMap.deleteMany({ where: { labelId: id } });
    await tx.setLabelEvidence.deleteMany({ where: { labelId: id } });
    await tx.labelNetworkLink.deleteMany({ where: { labelId: id } });
    await tx.projectLabel.deleteMany({ where: { labelId: id } });

    const deleted = await tx.label.delete({
      where: { id },
    });

    for (const channelId of affectedChannelIds) {
      await syncChannelOwnerLabel(tx, channelId);
    }

    return deleted;
  });
}

