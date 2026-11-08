import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getCoverPhotosForSets, getHeadshotsForPersons, getMediaGalleryItemsByIds } from "./media-service";
import { BRAND_SELECT, brandOf } from "./brand-of";
import type { KnownForSet, PersonShowcase, ShowcaseMode, ShowcaseSource } from "./person-showcase-service";

// The work of a channel, a label or an artist (2026-11-08) — the person page's
// Showcase, Known for and a row of faces, over the maker's sets instead of a
// person's photos. Same ranking as the person showcase: iconic (in the order you
// tagged it), ★, outtake, then the rest at random, two photos per set in turn so
// big sets do not crowd out small ones; Random ignores the marks for the choice.

export type MakerKind = "channel" | "label" | "artist";
export type MakerScope = { kind: MakerKind; id: string };

const SOURCE_BY_LEVEL: Record<number, ShowcaseSource> = { 1: "iconic", 2: "favorite", 3: "outtake", 4: "random" };
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TIMEZONE ?? "Europe/Berlin" });
const newSeed = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/** The maker's sets: a channel's, the sets of a label's channels, the sets crediting an artist */
function scopeSets({ kind, id }: MakerScope): Prisma.Sql {
  switch (kind) {
    case "channel":
      return Prisma.sql`SELECT s.id FROM "Set" s WHERE s."channelId" = ${id}`;
    case "label":
      return Prisma.sql`SELECT s.id FROM "Set" s JOIN "Channel" c ON c.id = s."channelId" WHERE c."labelId" = ${id}`;
    case "artist":
      return Prisma.sql`SELECT DISTINCT cr."setId" AS id FROM "SetCreditRaw" cr
        WHERE cr."resolvedArtistId" = ${id} AND cr."resolutionStatus" = 'RESOLVED'`;
  }
}

export async function getMakerShowcase(
  scope: MakerScope,
  opts: { size?: number; day?: string; mode?: ShowcaseMode; seed?: string } = {},
): Promise<PersonShowcase> {
  const size = opts.size ?? 48;
  const random = opts.mode === "random";
  const seed = random && opts.seed ? opts.seed : `${scope.kind}:${scope.id}:${opts.day ?? DAY.format(new Date())}`;

  const roundPartition = random ? Prisma.sql`grp` : Prisma.sql`level, grp`;
  const order = random
    ? Prisma.sql`round, md5(grp || ${seed}), md5(id || ${seed})`
    : Prisma.sql`level, "iconicAt" DESC NULLS LAST,
      CASE WHEN level = 4 THEN round END, CASE WHEN level = 4 THEN md5(grp || ${seed}) END, md5(id || ${seed})`;

  const rows = await prisma.$queryRaw<{ id: string; level: number; grp: string }[]>`
    WITH sets AS (${scopeSets(scope)}),
    -- A photo in several of the maker's sets counts once, under its first set
    shown AS (
      SELECT mi.id, mi."isFavorite", min(smi."setId") AS grp
      FROM "SetMediaItem" smi
      JOIN "MediaItem" mi ON mi.id = smi."mediaItemId"
      WHERE smi."setId" IN (SELECT id FROM sets)
        AND mi."mediaType" = 'PHOTO' AND NOT mi."isAnnotation" AND mi."decodeIssue" IS NULL
      GROUP BY mi.id, mi."isFavorite"
    ),
    marks AS (
      SELECT t."mediaItemId" AS id,
        max(t."createdAt") FILTER (WHERE d.slug = 'iconic') AS "iconicAt",
        bool_or(d.slug = 'outtake') AS outtake
      FROM media_item_tag t
      JOIN tag_definition d ON d.id = t."tagDefinitionId"
      WHERE d.slug IN ('iconic', 'outtake') AND t."mediaItemId" IN (SELECT id FROM shown)
      GROUP BY t."mediaItemId"
    ),
    leveled AS (
      SELECT sh.id, sh.grp, m."iconicAt",
        CASE WHEN m."iconicAt" IS NOT NULL THEN 1 WHEN sh."isFavorite" THEN 2 WHEN m.outtake THEN 3 ELSE 4 END AS level
      FROM shown sh
      LEFT JOIN marks m ON m.id = sh.id
    ),
    ranked AS (
      SELECT l.*, (row_number() OVER (PARTITION BY ${roundPartition} ORDER BY md5(id || ${seed})) - 1) / 2 AS round
      FROM leveled l
    )
    SELECT id, level, grp FROM ranked
    ORDER BY ${order}
    LIMIT ${size}
  `;

  const items = await getMediaGalleryItemsByIds(rows.map((r) => r.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  return {
    mode: random ? "random" : "best",
    items: rows.flatMap((r) => {
      const item = byId.get(r.id);
      return item ? [{ ...item, source: SOURCE_BY_LEVEL[r.level] }] : [];
    }),
    curatedCount: rows.filter((r) => r.level < 4).length,
    setCount: new Set(rows.map((r) => r.grp)).size,
  };
}

/** What the Overview opens with: a random deal, new on every visit (as on the person page) */
export async function getMakerOverviewShowcase(scope: MakerScope): Promise<PersonShowcase> {
  return getMakerShowcase(scope, { mode: "random", seed: newSeed() });
}

/** The maker's sets as posters: your highest-rated first, then the newest */
export async function getMakerKnownFor(scope: MakerScope, limit = 8): Promise<KnownForSet[]> {
  const ids = (await prisma.$queryRaw<{ id: string }[]>`${scopeSets(scope)}`).map((r) => r.id);
  if (ids.length === 0) return [];
  const sets = await prisma.set.findMany({
    where: { id: { in: ids } },
    orderBy: [{ rating: { sort: "desc", nulls: "last" } }, { releaseDate: { sort: "desc", nulls: "last" } }],
    take: limit,
    select: {
      id: true,
      title: true,
      releaseDate: true,
      rating: true,
      type: true,
      channel: { select: { id: true, name: true, shortName: true, ...BRAND_SELECT } },
    },
  });
  const covers = await getCoverPhotosForSets(sets.map((s) => s.id));
  return sets.map((s) => {
    const cover = covers.get(s.id);
    return {
      id: s.id,
      title: s.title,
      year: s.releaseDate ? Number(DAY.format(s.releaseDate).slice(0, 4)) : null,
      channelName: s.channel?.name ?? null,
      channelId: s.channel?.id ?? null,
      channelBrand: s.channel ? brandOf(s.channel) : null,
      rating: s.rating,
      isVideo: s.type === "video",
      coverUrl: cover?.url ?? null,
      coverFocalX: cover?.focalX ?? null,
      coverFocalY: cover?.focalY ?? null,
    };
  });
}

export type MakerFace = {
  personId: string;
  name: string;
  icgId: string;
  /** The maker's sets they lead */
  sets: number;
  headshotUrl: string | null;
  focalX: number | null;
  focalY: number | null;
};

/** The models seen most: Persons leading the maker's sets, by how many */
export async function getMakerFaces(scope: MakerScope, limit = 12): Promise<MakerFace[]> {
  const rows = await prisma.$queryRaw<{ personId: string; sets: bigint }[]>`
    WITH sets AS (${scopeSets(scope)})
    SELECT sp."personId", count(DISTINCT sp."setId") AS sets
    FROM "SetParticipant" sp
    JOIN "ContributionRoleDefinition" rd ON rd.id = sp."roleDefinitionId"
    JOIN "ContributionRoleGroup" rg ON rg.id = rd."groupId"
    WHERE sp."setId" IN (SELECT id FROM sets) AND rg.kind = 'ON_CAMERA' AND rd.presence = 'LEAD'
    GROUP BY sp."personId"
    ORDER BY sets DESC, sp."personId"
    LIMIT ${limit}
  `;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.personId);
  const [people, headshots] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, icgId: true, aliases: { where: { isCommon: true }, take: 1, select: { name: true } } },
    }),
    getHeadshotsForPersons(ids),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.flatMap((r) => {
    const p = byId.get(r.personId);
    if (!p) return [];
    const h = headshots.get(r.personId);
    return [
      {
        personId: p.id,
        name: p.aliases[0]?.name ?? p.icgId,
        icgId: p.icgId,
        sets: Number(r.sets),
        headshotUrl: h?.thumbUrl ?? h?.url ?? null,
        focalX: h?.focalX ?? null,
        focalY: h?.focalY ?? null,
      },
    ];
  });
}
