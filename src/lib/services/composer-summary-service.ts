import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { photoSql } from "@/lib/media-role";

// What the Composer's photo-level tags say about a set (ADR-0042, S5): per path,
// how many of its photos are tagged there and which tags they carry — the set's
// wardrobe, computed from its photos rather than stored on the set. And, for the
// cards, how many photos carry any Composer tag at all.

export type ComposerCoverage = { tagged: number; total: number };

export type ComposerSummaryPath = {
  id: string;
  name: string;
  /** Photos with at least one tag of this path */
  tagged: number;
  tags: { id: string; name: string; count: number }[];
};

export type ComposerSummary = { total: number; tagged: number; paths: ComposerSummaryPath[] };

/** The set's photos (cover art and videos left out) */
const setPhotos = (setId: string) => Prisma.sql`
  SELECT mi.id FROM "SetMediaItem" smi JOIN "MediaItem" mi ON mi.id = smi."mediaItemId"
  WHERE smi."setId" = ${setId} AND mi."mediaType" = 'PHOTO' AND ${photoSql("mi")}`;

/** A Composer tag's path: its group sits in one of the path's sections */
const TAG_PATH = Prisma.sql`
  SELECT DISTINCT sg."groupId", p.id AS path_id, p.name AS path_name, p."sortOrder" AS path_order
  FROM composer_section_group sg JOIN composer_section s ON s.id = sg."sectionId" JOIN composer_path p ON p.id = s."pathId"`;

export async function getComposerSummary(setId: string, perPath = 12): Promise<ComposerSummary> {
  const [totals, rows, paths] = await Promise.all([
    prisma.$queryRaw<{ total: number; tagged: number }[]>(Prisma.sql`
      WITH ph AS (${setPhotos(setId)}), tp AS (${TAG_PATH})
      SELECT (SELECT count(*)::int FROM ph) AS total,
             (SELECT count(DISTINCT mt."mediaItemId")::int FROM media_item_tag mt
                JOIN tag_definition t ON t.id = mt."tagDefinitionId" JOIN tp ON tp."groupId" = t."groupId"
                WHERE mt."mediaItemId" IN (SELECT id FROM ph)) AS tagged`),
    prisma.$queryRaw<{ path_id: string; tag_id: string; tag_name: string; n: number; path_tagged: number }[]>(Prisma.sql`
      WITH ph AS (${setPhotos(setId)}), tp AS (${TAG_PATH}),
      hits AS (
        SELECT DISTINCT tp.path_id, t.id AS tag_id, t.name AS tag_name, mt."mediaItemId"
        FROM media_item_tag mt JOIN tag_definition t ON t.id = mt."tagDefinitionId" JOIN tp ON tp."groupId" = t."groupId"
        WHERE mt."mediaItemId" IN (SELECT id FROM ph)
      )
      SELECT h.path_id, h.tag_id, h.tag_name, count(*)::int AS n,
             (SELECT count(DISTINCT x."mediaItemId")::int FROM hits x WHERE x.path_id = h.path_id) AS path_tagged
      FROM hits h GROUP BY h.path_id, h.tag_id, h.tag_name
      ORDER BY n DESC, h.tag_name`),
    prisma.composerPath.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    total: totals[0]?.total ?? 0,
    tagged: totals[0]?.tagged ?? 0,
    paths: paths.map((p) => {
      const mine = rows.filter((r) => r.path_id === p.id);
      return {
        id: p.id,
        name: p.name,
        tagged: mine[0]?.path_tagged ?? 0,
        tags: mine.slice(0, perPath).map((r) => ({ id: r.tag_id, name: r.tag_name, count: r.n })),
      };
    }),
  };
}

/** set id → photos with any Composer tag, of all its photos — for the cards (sets with no photos left out) */
export async function getComposerCoverageForSets(setIds: string[]): Promise<Map<string, ComposerCoverage>> {
  const out = new Map<string, ComposerCoverage>();
  if (setIds.length === 0) return out;
  const rows = await prisma.$queryRaw<{ set_id: string; total: number; tagged: number }[]>(Prisma.sql`
    WITH tp AS (${TAG_PATH})
    SELECT smi."setId" AS set_id, count(DISTINCT mi.id)::int AS total,
           count(DISTINCT mi.id) FILTER (WHERE EXISTS (
             SELECT 1 FROM media_item_tag mt JOIN tag_definition t ON t.id = mt."tagDefinitionId"
             JOIN tp ON tp."groupId" = t."groupId" WHERE mt."mediaItemId" = mi.id))::int AS tagged
    FROM "SetMediaItem" smi JOIN "MediaItem" mi ON mi.id = smi."mediaItemId"
    WHERE smi."setId" IN (${Prisma.join(setIds)}) AND mi."mediaType" = 'PHOTO' AND ${photoSql("mi")}
    GROUP BY smi."setId"`);
  for (const r of rows) if (r.total > 0) out.set(r.set_id, { tagged: r.tagged, total: r.total });
  return out;
}
