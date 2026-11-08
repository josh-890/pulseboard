import { Prisma } from "@/generated/prisma/client";
import type { ChannelTier } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { normalizeForSearch } from "@/lib/normalize";
import { getCoverPhotosForSets, type CoverPhotoData } from "./media-service";
import { BRAND_SELECT, brandOf } from "./brand-of";
import type { EntityBrand } from "@/lib/brand-mark";

// The list pages of channels, labels and artists as tiles (2026-11-08): each
// maker with its mark, the covers of its three newest sets and its numbers — in
// a few bulk queries, however many makers there are.

export type MakerListSort = "sets" | "rating" | "newest" | "name";

export type MakerTileData = {
  id: string;
  href: string;
  brand: EntityBrand;
  rating: number | null;
  /** Channels only */
  tier: ChannelTier | null;
  closed: boolean;
  /** A channel's label; an artist's nationality */
  context: { label: string; href?: string; brand?: EntityBrand } | null;
  sets: number;
  videoSets: number;
  /** Channels a label owns, channels an artist worked for */
  channels: number | null;
  firstYear: number | null;
  lastYear: number | null;
  covers: CoverPhotoData[];
};

type SetStats = { owner: string; sets: bigint; video: bigint; first: Date | null; last: Date | null; channels: bigint };

const COVERS_PER_TILE = 3;

/** Covers of each owner's newest sets, from (owner, set) pairs — sets without a cover are skipped */
async function newestCovers(pairs: { owner: string; setId: string; releaseDate: Date | null }[]): Promise<Map<string, CoverPhotoData[]>> {
  const byOwner = new Map<string, string[]>();
  const sorted = [...pairs].sort((a, b) => (b.releaseDate?.getTime() ?? 0) - (a.releaseDate?.getTime() ?? 0));
  for (const p of sorted) {
    const list = byOwner.get(p.owner) ?? [];
    if (list.length < COVERS_PER_TILE * 2) list.push(p.setId); // spare ones for sets without a cover
    byOwner.set(p.owner, list);
  }
  const covers = await getCoverPhotosForSets([...new Set([...byOwner.values()].flat())]);
  const out = new Map<string, CoverPhotoData[]>();
  for (const [owner, setIds] of byOwner) {
    out.set(
      owner,
      setIds.flatMap((id) => (covers.get(id) ? [covers.get(id)!] : [])).slice(0, COVERS_PER_TILE),
    );
  }
  return out;
}

const yearOf = (d: Date | null) => (d ? d.getUTCFullYear() : null);

function sortTiles(tiles: MakerTileData[], sort: MakerListSort): MakerTileData[] {
  const name = (t: MakerTileData) => t.brand.name.toLowerCase();
  return [...tiles].sort((a, b) => {
    switch (sort) {
      case "rating":
        return (b.rating ?? 0) - (a.rating ?? 0) || b.sets - a.sets || name(a).localeCompare(name(b));
      case "newest":
        return (b.lastYear ?? 0) - (a.lastYear ?? 0) || b.sets - a.sets || name(a).localeCompare(name(b));
      case "name":
        return name(a).localeCompare(name(b));
      default:
        return b.sets - a.sets || name(a).localeCompare(name(b));
    }
  });
}

/** Up to `limit` newest sets per owner, as (owner, set) pairs, for the cover strips */
async function newestSetPairs(ownerSql: Prisma.Sql): Promise<{ owner: string; setId: string; releaseDate: Date | null }[]> {
  return prisma.$queryRaw<{ owner: string; setId: string; releaseDate: Date | null }[]>(Prisma.sql`
    SELECT owner, "setId", "releaseDate" FROM (
      SELECT x.owner, x."setId", x."releaseDate",
        row_number() OVER (PARTITION BY x.owner ORDER BY x."releaseDate" DESC NULLS LAST) AS rn
      FROM (${ownerSql}) x
    ) r WHERE rn <= ${COVERS_PER_TILE * 2}
  `);
}

// ─── Channels ────────────────────────────────────────────────────────────────

export async function getChannelTiles(opts: {
  q?: string;
  labelId?: string;
  tier?: ChannelTier;
  minRating?: number;
  sort: MakerListSort;
}): Promise<MakerTileData[]> {
  const norm = opts.q ? normalizeForSearch(opts.q) : null;
  const channels = await prisma.channel.findMany({
    where: {
      ...(norm ? { OR: [{ nameNorm: { contains: norm } }, { name: { contains: opts.q, mode: "insensitive" } }, { shortName: { contains: opts.q, mode: "insensitive" } }] } : {}),
      ...(opts.labelId ? { labelId: opts.labelId } : {}),
      ...(opts.tier ? { tier: opts.tier } : {}),
      ...(opts.minRating ? { rating: { gte: opts.minRating } } : {}),
    },
    select: {
      id: true,
      name: true,
      shortName: true,
      tier: true,
      rating: true,
      closed: true,
      ...BRAND_SELECT,
      label: { select: { id: true, name: true, ...BRAND_SELECT } },
    },
  });
  if (channels.length === 0) return [];
  const ids = channels.map((c) => c.id);
  const [stats, pairs] = await Promise.all([
    prisma.$queryRaw<SetStats[]>(Prisma.sql`
      SELECT s."channelId" AS owner, count(*) AS sets, count(*) FILTER (WHERE s.type = 'video') AS video,
        min(s."releaseDate") AS first, max(s."releaseDate") AS last, 1::bigint AS channels
      FROM "Set" s WHERE s."channelId" = ANY(${ids}::text[]) GROUP BY s."channelId"
    `),
    newestSetPairs(Prisma.sql`SELECT s."channelId" AS owner, s.id AS "setId", s."releaseDate" FROM "Set" s WHERE s."channelId" = ANY(${ids}::text[])`),
  ]);
  const byId = new Map(stats.map((r) => [r.owner, r]));
  const covers = await newestCovers(pairs);
  return sortTiles(
    channels.map((c) => {
      const r = byId.get(c.id);
      return {
        id: c.id,
        href: `/channels/${c.id}`,
        brand: brandOf(c),
        rating: c.rating,
        tier: c.tier,
        closed: c.closed,
        context: c.label ? { label: c.label.name, href: `/labels/${c.label.id}`, brand: brandOf(c.label) } : null,
        sets: Number(r?.sets ?? 0),
        videoSets: Number(r?.video ?? 0),
        channels: null,
        firstYear: yearOf(r?.first ?? null),
        lastYear: yearOf(r?.last ?? null),
        covers: covers.get(c.id) ?? [],
      };
    }),
    opts.sort,
  );
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export async function getLabelTiles(opts: { q?: string; minRating?: number; sort: MakerListSort }): Promise<MakerTileData[]> {
  const labels = await prisma.label.findMany({
    where: {
      ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}),
      ...(opts.minRating ? { rating: { gte: opts.minRating } } : {}),
    },
    select: { id: true, name: true, rating: true, ...BRAND_SELECT, _count: { select: { ownedChannels: true } } },
  });
  if (labels.length === 0) return [];
  const ids = labels.map((l) => l.id);
  const owned = Prisma.sql`SELECT c."labelId" AS owner, s.id AS "setId", s."releaseDate", s.type FROM "Set" s JOIN "Channel" c ON c.id = s."channelId" WHERE c."labelId" = ANY(${ids}::text[])`;
  const [stats, pairs] = await Promise.all([
    prisma.$queryRaw<SetStats[]>(Prisma.sql`
      SELECT x.owner, count(*) AS sets, count(*) FILTER (WHERE x.type = 'video') AS video,
        min(x."releaseDate") AS first, max(x."releaseDate") AS last, 0::bigint AS channels
      FROM (${owned}) x GROUP BY x.owner
    `),
    newestSetPairs(owned),
  ]);
  const byId = new Map(stats.map((r) => [r.owner, r]));
  const covers = await newestCovers(pairs);
  return sortTiles(
    labels.map((l) => {
      const r = byId.get(l.id);
      return {
        id: l.id,
        href: `/labels/${l.id}`,
        brand: brandOf(l),
        rating: l.rating,
        tier: null,
        closed: false,
        context: null,
        sets: Number(r?.sets ?? 0),
        videoSets: Number(r?.video ?? 0),
        channels: l._count.ownedChannels,
        firstYear: yearOf(r?.first ?? null),
        lastYear: yearOf(r?.last ?? null),
        covers: covers.get(l.id) ?? [],
      };
    }),
    opts.sort,
  );
}

// ─── Artists ─────────────────────────────────────────────────────────────────

export async function getArtistTiles(opts: { q?: string; minRating?: number; sort: MakerListSort }): Promise<MakerTileData[]> {
  const artists = await prisma.artist.findMany({
    where: {
      ...(opts.q
        ? { OR: [{ nameNorm: { contains: normalizeForSearch(opts.q) } }, { aliases: { some: { aliasNorm: { contains: normalizeForSearch(opts.q) } } } }] }
        : {}),
      ...(opts.minRating ? { rating: { gte: opts.minRating } } : {}),
    },
    select: { id: true, name: true, nationality: true, rating: true, ...BRAND_SELECT },
  });
  if (artists.length === 0) return [];
  const ids = artists.map((a) => a.id);
  const credited = Prisma.sql`
    SELECT DISTINCT cr."resolvedArtistId" AS owner, s.id AS "setId", s."releaseDate", s.type, s."channelId"
    FROM "SetCreditRaw" cr JOIN "Set" s ON s.id = cr."setId"
    WHERE cr."resolvedArtistId" = ANY(${ids}::text[]) AND cr."resolutionStatus" = 'RESOLVED'`;
  const [stats, pairs] = await Promise.all([
    prisma.$queryRaw<SetStats[]>(Prisma.sql`
      SELECT x.owner, count(*) AS sets, count(*) FILTER (WHERE x.type = 'video') AS video,
        min(x."releaseDate") AS first, max(x."releaseDate") AS last, count(DISTINCT x."channelId") AS channels
      FROM (${credited}) x GROUP BY x.owner
    `),
    newestSetPairs(credited),
  ]);
  const byId = new Map(stats.map((r) => [r.owner, r]));
  const covers = await newestCovers(pairs);
  return sortTiles(
    artists.map((a) => {
      const r = byId.get(a.id);
      return {
        id: a.id,
        href: `/artists/${a.id}`,
        brand: brandOf(a),
        rating: a.rating,
        tier: null,
        closed: false,
        context: a.nationality ? { label: a.nationality } : null,
        sets: Number(r?.sets ?? 0),
        videoSets: Number(r?.video ?? 0),
        channels: Number(r?.channels ?? 0),
        firstYear: yearOf(r?.first ?? null),
        lastYear: yearOf(r?.last ?? null),
        covers: covers.get(a.id) ?? [],
      };
    }),
    opts.sort,
  );
}
