import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { buildUrl } from "@/lib/media-url";
import type { PhotoVariants } from "@/lib/types";
import { ART_COPY_MAX_BITS, cleanupDeletedFiles } from "./cover-art-service";
import { cascadeHardDeleteMediaItems } from "./cascade-helpers";
import { refreshDashboardStats } from "./view-service";

/**
 * Cover-art duplicates already in the data (ADR-0040, the reviewed cleanup).
 *
 * A candidate is a cover-art file that a file of the same set copies: dHash at
 * most ART_COPY_MAX_BITS apart and at least as many pixels — the 512px archive
 * stand-in next to its real picture, or the smaller of two identical publisher
 * covers. Equal size: the later id goes, so a pair never loses both. Nothing is
 * deleted here without the list being looked at first.
 */

/**
 * copy — two copies of the same cover art (keep the larger);
 * standIn — a transferred stand-in of a photo of the set;
 * crop — a `Title-c.jpg` close to a photo: often the publisher's crop of it,
 *   real cover art — listed, not pre-selected.
 */
export type CoverDuplicateKind = "copy" | "standIn" | "crop";

export type CoverDuplicate = {
  kind: CoverDuplicateKind;
  id: string;
  filename: string;
  width: number;
  height: number;
  thumbUrl: string | null;
  isCover: boolean;
  keptId: string;
  keptFilename: string;
  keptWidth: number;
  keptHeight: number;
  keptThumbUrl: string | null;
  keptIsArt: boolean;
  distance: number;
  setId: string;
  setTitle: string;
};

type Row = {
  transferred: boolean;
  id: string;
  filename: string;
  width: number;
  height: number;
  variants: unknown;
  isCover: boolean;
  keptId: string;
  keptFilename: string;
  keptWidth: number;
  keptHeight: number;
  keptVariants: unknown;
  keptIsArt: boolean;
  distance: number;
  setId: string;
  setTitle: string;
};

const thumb = (variants: unknown): string | null => {
  const v = (variants ?? {}) as PhotoVariants;
  const key = v.gallery_512 ?? v.master_4000 ?? v.original;
  return key ? buildUrl(key) : null;
};

/** dHash Hamming distance in SQL (16 hex digits = 64 bits) */
const dist = (a: Prisma.Sql, b: Prisma.Sql) =>
  Prisma.sql`bit_count(('x' || ${a})::bit(64) # ('x' || ${b})::bit(64))`;

export async function findCoverDuplicates(onlyIds?: string[]): Promise<CoverDuplicate[]> {
  const scope = onlyIds ? Prisma.sql`AND a.id = ANY(${onlyIds})` : Prisma.empty;
  const rows = await prisma.$queryRaw<Row[]>`
    WITH pairs AS (
      SELECT a."isTransferredCover" AS transferred, a.id, a.filename, a."originalWidth" AS width, a."originalHeight" AS height, a.variants,
        (s."coverMediaItemId" = a.id) AS "isCover",
        o.id AS "keptId", o.filename AS "keptFilename", o."originalWidth" AS "keptWidth",
        o."originalHeight" AS "keptHeight", o.variants AS "keptVariants", (o.role = 'COVER_ART') AS "keptIsArt",
        ${dist(Prisma.sql`a.phash`, Prisma.sql`o.phash`)}::int AS distance,
        s.id AS "setId", s.title AS "setTitle"
      FROM "MediaItem" a
      JOIN "SetMediaItem" sa ON sa."mediaItemId" = a.id
      JOIN "Set" s ON s.id = sa."setId"
      JOIN "SetMediaItem" so ON so."setId" = sa."setId" AND so."mediaItemId" <> a.id
      JOIN "MediaItem" o ON o.id = so."mediaItemId"
      WHERE a.role = 'COVER_ART' AND a."mediaType" = 'PHOTO' AND o."mediaType" = 'PHOTO'
        AND a.phash ~ '^[0-9a-f]{16}$' AND o.phash ~ '^[0-9a-f]{16}$'
        AND (o."originalWidth" * o."originalHeight" > a."originalWidth" * a."originalHeight"
          OR (o."originalWidth" * o."originalHeight" = a."originalWidth" * a."originalHeight" AND o.id < a.id))
        ${scope}
    )
    SELECT DISTINCT ON (id) * FROM pairs
    WHERE distance <= ${ART_COPY_MAX_BITS}
    ORDER BY id, distance, "keptWidth" * "keptHeight" DESC
  `;
  return rows
    .map((r) => ({
      kind: (r.keptIsArt ? "copy" : r.transferred ? "standIn" : "crop") as CoverDuplicateKind,
      id: r.id,
      filename: r.filename,
      width: r.width,
      height: r.height,
      thumbUrl: thumb(r.variants),
      isCover: r.isCover,
      keptId: r.keptId,
      keptFilename: r.keptFilename,
      keptWidth: r.keptWidth,
      keptHeight: r.keptHeight,
      keptThumbUrl: thumb(r.keptVariants),
      keptIsArt: r.keptIsArt,
      distance: r.distance,
      setId: r.setId,
      setTitle: r.setTitle,
    }))
    .sort((a, b) => a.setTitle.localeCompare(b.setTitle));
}

/**
 * Delete the listed candidates that are still candidates. Each one's cover
 * pointers (set, session) move to the file that copies it — through a chain
 * (stand-in → cover.jpg → Title-c.jpg) to the one that stays; "kept" is always
 * strictly larger or the earlier id, so the chain ends.
 */
export async function deleteCoverDuplicates(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const current = await findCoverDuplicates(ids);
  const keptOf = new Map(current.map((c) => [c.id, c.keptId]));
  const root = (id: string): string => {
    let at = id;
    for (let n = 0; keptOf.has(at) && n < 50; n++) at = keptOf.get(at)!;
    return at;
  };
  const safe = current.map((c) => ({ ...c, keptId: root(c.id) }));
  let deleted = 0;
  for (let i = 0; i < safe.length; i += 200) {
    const batch = safe.slice(i, i + 200);
    const removed = await prisma.$transaction(async (tx) => {
      for (const c of batch) {
        await tx.set.updateMany({
          where: { coverMediaItemId: c.id },
          data: { coverMediaItemId: c.keptId, coverIsProvisional: false },
        });
        await tx.session.updateMany({ where: { coverMediaItemId: c.id }, data: { coverMediaItemId: c.keptId } });
      }
      return cascadeHardDeleteMediaItems(
        tx,
        batch.map((c) => c.id),
      );
    });
    await cleanupDeletedFiles(removed);
    deleted += batch.length;
  }
  await refreshDashboardStats();
  return deleted;
}
