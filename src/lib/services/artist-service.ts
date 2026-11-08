import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { normalizeForSearch } from "@/lib/normalize";
import { BRAND_SELECT, brandOf } from "@/lib/services/brand-of";
import type { EntityBrand } from "@/lib/brand-mark";

export async function getArtists(search?: string) {
  const where = search
    ? { nameNorm: { contains: normalizeForSearch(search), mode: "insensitive" as const } }
    : {};

  return prisma.artist.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { creditsRaw: { where: { resolutionStatus: "RESOLVED" } } } },
    },
  });
}

export async function getArtistById(id: string) {
  return prisma.artist.findUnique({
    where: { id },
    include: { aliases: { orderBy: { alias: "asc" }, select: { id: true, alias: true } } },
  });
}

export type ArtistStats = {
  setCount: number;
  channelCount: number;
  imageCount: number;
  videoCount: number;
};

export async function getArtistStats(id: string): Promise<ArtistStats> {
  const credits = await prisma.setCreditRaw.findMany({
    where: { resolvedArtistId: id, resolutionStatus: "RESOLVED" },
    include: {
      set: {
        select: {
          id: true,
          channelId: true,
          type: true,
          imageCount: true,
        },
      },
    },
  });

  const setIds = new Set<string>();
  const channelIds = new Set<string>();
  let imageCount = 0;
  let videoCount = 0;

  for (const credit of credits) {
    if (setIds.has(credit.set.id)) continue;
    setIds.add(credit.set.id);
    if (credit.set.channelId) channelIds.add(credit.set.channelId);
    if (credit.set.type === "video") {
      videoCount++;
    } else {
      imageCount += credit.set.imageCount ?? 0;
    }
  }

  return {
    setCount: setIds.size,
    channelCount: channelIds.size,
    imageCount,
    videoCount,
  };
}

export type ArtistCareerEntry = {
  setId: string;
  title: string;
  releaseDate: Date | null;
  type: string;
  imageCount: number | null;
  channelId: string | null;
  channelName: string | null;
  participants: Array<{ personId: string; name: string }>;
};

export type ArtistCareerGroup = {
  channelId: string | null;
  channelName: string;
  sets: ArtistCareerEntry[];
};

export async function getArtistCareer(id: string): Promise<ArtistCareerGroup[]> {
  const credits = await prisma.setCreditRaw.findMany({
    where: { resolvedArtistId: id, resolutionStatus: "RESOLVED" },
    include: {
      set: {
        select: {
          id: true,
          title: true,
          releaseDate: true,
          type: true,
          imageCount: true,
          channelId: true,
          channel: { select: { name: true } },
          participants: {
            select: {
              person: {
                select: {
                  id: true,
                  aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  // Deduplicate sets and group by channel
  const seenSets = new Set<string>();
  const groupMap = new Map<string | null, ArtistCareerEntry[]>();

  for (const credit of credits) {
    const s = credit.set;
    if (seenSets.has(s.id)) continue;
    seenSets.add(s.id);

    const entry: ArtistCareerEntry = {
      setId: s.id,
      title: s.title,
      releaseDate: s.releaseDate,
      type: s.type,
      imageCount: s.imageCount,
      channelId: s.channelId,
      channelName: s.channel?.name ?? "Unknown",
      participants: s.participants.map((p) => ({
        personId: p.person.id,
        name: p.person.aliases[0]?.name ?? "Unknown",
      })),
    };

    const key = s.channelId;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(entry);
  }

  // Sort sets within each group by date desc
  const groups: ArtistCareerGroup[] = [];
  for (const [channelId, sets] of groupMap) {
    sets.sort((a, b) => {
      if (!a.releaseDate && !b.releaseDate) return 0;
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return b.releaseDate.getTime() - a.releaseDate.getTime();
    });
    groups.push({
      channelId,
      channelName: sets[0].channelName ?? "Unknown",
      sets,
    });
  }

  // Sort groups by set count desc
  groups.sort((a, b) => b.sets.length - a.sets.length);

  return groups;
}

export async function createArtist(data: {
  name: string;
  nationality?: string;
  bio?: string;
}) {
  return prisma.artist.create({
    data: {
      name: data.name,
      nameNorm: normalizeForSearch(data.name),
      nationality: data.nationality || null,
      bio: data.bio || null,
    },
  });
}

export async function updateArtist(
  id: string,
  data: { name?: string; nationality?: string | null; bio?: string | null; website?: string | null },
) {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.nameNorm = normalizeForSearch(data.name);
  }
  if (data.nationality !== undefined) updateData.nationality = data.nationality || null;
  if (data.bio !== undefined) updateData.bio = data.bio || null;
  if (data.website !== undefined) updateData.website = data.website?.trim() || null;

  return prisma.artist.update({ where: { id }, data: updateData });
}

export async function deleteArtist(id: string) {
  return prisma.$transaction(async (tx) => {
    // Unresolve all credits pointing to this artist
    await tx.setCreditRaw.updateMany({
      where: { resolvedArtistId: id },
      data: { resolvedArtistId: null, resolutionStatus: "UNRESOLVED" },
    });

    return tx.artist.delete({ where: { id } });
  });
}

export async function searchArtists(query: string) {
  if (!query.trim()) return [];

  return prisma.artist.findMany({
    where: { nameNorm: { contains: normalizeForSearch(query), mode: "insensitive" } },
    select: { id: true, name: true, nationality: true },
    take: 10,
    orderBy: { name: "asc" },
  });
}

export async function getSuggestedArtists(rawName: string) {
  if (!rawName.trim()) return [];
  const norm = normalizeForSearch(rawName);
  type Row = { id: string; name: string; nationality: string | null; sim: number };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, name, nationality, similarity("nameNorm", ${norm}) AS sim
    FROM "Artist"
    WHERE similarity("nameNorm", ${norm}) >= 0.3
    ORDER BY sim DESC
    LIMIT 3
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, nationality: r.nationality, sim: Number(r.sim) }));
}

// ─── Artist page (2026-11-08) ────────────────────────────────────────────────

export type ArtistHeroStats = {
  photoSets: number;
  videoSets: number;
  channels: number;
  /** Persons leading the sets credited to them */
  models: number;
  /** What they are credited as: Photographer, Director … */
  roles: string[];
  firstYear: number | null;
  lastYear: number | null;
};

const CREDITED_SETS = (artistId: string) => Prisma.sql`
  SELECT DISTINCT cr."setId" AS id FROM "SetCreditRaw" cr
  WHERE cr."resolvedArtistId" = ${artistId} AND cr."resolutionStatus" = 'RESOLVED'`;

export async function getArtistHeroStats(artistId: string): Promise<ArtistHeroStats> {
  const [row] = await prisma.$queryRaw<
    Array<{ photo: bigint; video: bigint; channels: bigint; models: bigint; first: Date | null; last: Date | null; roles: string[] | null }>
  >(Prisma.sql`
    WITH sets AS (${CREDITED_SETS(artistId)})
    SELECT
      (SELECT count(*) FROM "Set" s WHERE s.id IN (SELECT id FROM sets) AND s.type = 'photo') AS photo,
      (SELECT count(*) FROM "Set" s WHERE s.id IN (SELECT id FROM sets) AND s.type = 'video') AS video,
      (SELECT count(DISTINCT s."channelId") FROM "Set" s WHERE s.id IN (SELECT id FROM sets)) AS channels,
      (SELECT count(DISTINCT sp."personId")
         FROM "SetParticipant" sp
         JOIN "ContributionRoleDefinition" rd ON rd.id = sp."roleDefinitionId"
         JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
        WHERE sp."setId" IN (SELECT id FROM sets) AND rg.kind = 'ON_CAMERA' AND rd.presence = 'LEAD') AS models,
      (SELECT min(s."releaseDate") FROM "Set" s WHERE s.id IN (SELECT id FROM sets)) AS first,
      (SELECT max(s."releaseDate") FROM "Set" s WHERE s.id IN (SELECT id FROM sets)) AS last,
      (SELECT array_agg(DISTINCT rd.name ORDER BY rd.name)
         FROM "SetCreditRaw" cr JOIN "ContributionRoleDefinition" rd ON rd.id = cr."roleDefinitionId"
        WHERE cr."resolvedArtistId" = ${artistId} AND cr."resolutionStatus" = 'RESOLVED') AS roles
  `);
  return {
    photoSets: Number(row?.photo ?? 0),
    videoSets: Number(row?.video ?? 0),
    channels: Number(row?.channels ?? 0),
    models: Number(row?.models ?? 0),
    roles: row?.roles ?? [],
    firstYear: row?.first ? row.first.getUTCFullYear() : null,
    lastYear: row?.last ? row.last.getUTCFullYear() : null,
  };
}

export type ArtistChannel = { id: string; brand: EntityBrand; sets: number };

/** The channels they worked for, most sets first */
export async function getArtistChannels(artistId: string): Promise<ArtistChannel[]> {
  const rows = await prisma.$queryRaw<Array<{ channelId: string; n: bigint }>>(Prisma.sql`
    WITH sets AS (${CREDITED_SETS(artistId)})
    SELECT s."channelId", count(*) AS n FROM "Set" s
    WHERE s.id IN (SELECT id FROM sets) AND s."channelId" IS NOT NULL
    GROUP BY s."channelId" ORDER BY n DESC
  `);
  if (rows.length === 0) return [];
  const channels = await prisma.channel.findMany({
    where: { id: { in: rows.map((r) => r.channelId) } },
    select: { id: true, name: true, shortName: true, ...BRAND_SELECT },
  });
  const byId = new Map(channels.map((c) => [c.id, c]));
  return rows.flatMap((r) => {
    const c = byId.get(r.channelId);
    return c ? [{ id: c.id, brand: brandOf(c), sets: Number(r.n) }] : [];
  });
}

/** Your liking, 1–5; null clears it */
export async function setArtistRating(artistId: string, rating: number | null): Promise<void> {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("A rating is 1 to 5");
  }
  await prisma.artist.update({ where: { id: artistId }, data: { rating } });
}

/** About (the bio) or notes; blank clears it */
export async function setArtistText(artistId: string, field: "bio" | "notes", text: string): Promise<void> {
  const value = text.trim() ? text.trim() : null;
  await prisma.artist.update({ where: { id: artistId }, data: { [field]: value } });
}
