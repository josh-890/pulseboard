import { prisma } from "@/lib/db";
import { cascadeHardDeleteMediaItems } from "@/lib/services/cascade-helpers";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  refreshDashboardStats,
  refreshPersonCurrentState,
  refreshPersonAffiliations,
} from "@/lib/services/view-service";

export type MaintenanceResult = {
  found: number;
  fixed: number;
  details: string[];
};

/**
 * Find MediaItems with no file variants (null, empty object, or missing `original` key)
 * and hard-delete them along with all referencing rows.
 */
export async function findAndFixOrphanedMedia(): Promise<MaintenanceResult> {
  return prisma.$transaction(async (tx) => {
    // Find orphaned media items — variants is null, empty, or missing "original"
    const orphans = await tx.$queryRaw<
      Array<{ id: string; filename: string }>
    >`
      SELECT id, filename
      FROM "MediaItem"
      WHERE (
        variants IS NULL
        OR variants::text = '{}'
        OR variants::text = 'null'
        OR (NOT (variants ? 'original') AND NOT (variants ? 'master_4000'))
      )
    `;

    if (orphans.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    const ids = orphans.map((o) => o.id);

    // Cascade hard-delete: cleans up SetMediaItem, SkillEventMedia,
    // MediaCollectionItem, PersonMediaLink, and the MediaItems themselves
    await cascadeHardDeleteMediaItems(tx, ids);

    return {
      found: orphans.length,
      fixed: orphans.length,
      details: orphans.map((o) => o.filename),
    };
  });
}

/**
 * Find identical media files (same SHA-256 hash) uploaded multiple times to the
 * same session.  Keeps the oldest MediaItem per group and:
 *   - Reassigns PersonMediaLinks from dupe → original (deletes conflicts)
 *   - Deletes SetMediaItem rows pointing to dupe (skips if original already in set)
 *   - Deletes MediaCollectionItem rows pointing to dupe (skips if original already in collection)
 *   - Hard-deletes the duplicate MediaItem
 */
export async function findAndFixDuplicateMedia(): Promise<MaintenanceResult> {
  return prisma.$transaction(async (tx) => {
    // Groups of identical files in the same session
    const groups = await tx.$queryRaw<
      Array<{ sessionId: string; hash: string; cnt: bigint }>
    >`
      SELECT "sessionId", hash, COUNT(*) as cnt
      FROM "MediaItem"
      WHERE hash IS NOT NULL
        AND "sessionId" IS NOT NULL
      GROUP BY "sessionId", hash
      HAVING COUNT(*) > 1
    `;

    if (groups.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    let totalFixed = 0;
    const details: string[] = [];

    for (const group of groups) {
      // All items in this group, oldest first
      const items = await tx.$queryRaw<
        Array<{ id: string; filename: string; createdAt: Date }>
      >`
        SELECT id, filename, "createdAt"
        FROM "MediaItem"
        WHERE "sessionId" = ${group.sessionId}
          AND hash = ${group.hash}
        ORDER BY "createdAt" ASC
      `;

      const original = items[0];
      const dupes = items.slice(1);

      for (const dupe of dupes) {
        // --- PersonMediaLink: reassign dupe → original ---
        const dupeLinks = await tx.personMediaLink.findMany({
          where: { mediaItemId: dupe.id },
        });

        for (const link of dupeLinks) {
          // Check if original already has this (personId, usage) combo
          const conflict = await tx.personMediaLink.findFirst({
            where: {
              personId: link.personId,
              mediaItemId: original.id,
              usage: link.usage,
            },
          });

          if (conflict) {
            // Conflict — delete the dupe link
            await tx.personMediaLink.delete({
              where: { id: link.id },
            });
          } else {
            // Reassign to original
            await tx.personMediaLink.update({
              where: { id: link.id },
              data: { mediaItemId: original.id },
            });
          }
        }

        // --- SetMediaItem: delete dupe rows ---
        const dupeSetItems = await tx.$queryRaw<
          Array<{ setId: string }>
        >`
          SELECT "setId" FROM "SetMediaItem"
          WHERE "mediaItemId" = ${dupe.id}
        `;

        for (const si of dupeSetItems) {
          // Check if original already in this set
          const existing = await tx.$queryRaw<Array<{ setId: string }>>`
            SELECT "setId" FROM "SetMediaItem"
            WHERE "setId" = ${si.setId} AND "mediaItemId" = ${original.id}
          `;
          if (existing.length === 0) {
            // Move to original
            await tx.$executeRaw`
              UPDATE "SetMediaItem"
              SET "mediaItemId" = ${original.id}
              WHERE "setId" = ${si.setId} AND "mediaItemId" = ${dupe.id}
            `;
          } else {
            // Original already in set — just delete dupe row
            await tx.$executeRaw`
              DELETE FROM "SetMediaItem"
              WHERE "setId" = ${si.setId} AND "mediaItemId" = ${dupe.id}
            `;
          }
        }

        // --- MediaCollectionItem: delete dupe rows ---
        const dupeCollItems = await tx.$queryRaw<
          Array<{ collectionId: string }>
        >`
          SELECT "collectionId" FROM "MediaCollectionItem"
          WHERE "mediaItemId" = ${dupe.id}
        `;

        for (const ci of dupeCollItems) {
          const existing = await tx.$queryRaw<
            Array<{ collectionId: string }>
          >`
            SELECT "collectionId" FROM "MediaCollectionItem"
            WHERE "collectionId" = ${ci.collectionId} AND "mediaItemId" = ${original.id}
          `;
          if (existing.length === 0) {
            await tx.$executeRaw`
              UPDATE "MediaCollectionItem"
              SET "mediaItemId" = ${original.id}
              WHERE "collectionId" = ${ci.collectionId} AND "mediaItemId" = ${dupe.id}
            `;
          } else {
            await tx.$executeRaw`
              DELETE FROM "MediaCollectionItem"
              WHERE "collectionId" = ${ci.collectionId} AND "mediaItemId" = ${dupe.id}
            `;
          }
        }

        // --- Hard-delete the duplicate MediaItem ---
        await tx.mediaItem.delete({
          where: { id: dupe.id },
        });
      }

      totalFixed += dupes.length;
      details.push(
        `${original.filename}: removed ${dupes.length} duplicate(s)`,
      );
    }

    return {
      found: groups.length,
      fixed: totalFixed,
      details,
    };
  });
}

/**
 * Find duplicate PersonMediaLink rows (same personId + mediaItemId)
 * and delete all but the oldest per group.
 */
export async function findAndFixDuplicatePersonMediaLinks(): Promise<MaintenanceResult> {
  return prisma.$transaction(async (tx) => {
    // Find groups with duplicates
    const dupes = await tx.$queryRaw<
      Array<{ personId: string; mediaItemId: string; cnt: bigint }>
    >`
      SELECT "personId", "mediaItemId", COUNT(*) as cnt
      FROM "PersonMediaLink"
      GROUP BY "personId", "mediaItemId"
      HAVING COUNT(*) > 1
    `;

    if (dupes.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    let totalFixed = 0;
    const details: string[] = [];

    for (const dupe of dupes) {
      // Get all rows for this pair, oldest first
      const rows = await tx.personMediaLink.findMany({
        where: {
          personId: dupe.personId,
          mediaItemId: dupe.mediaItemId,
        },
        orderBy: { createdAt: "asc" },
      });

      // Keep the first (oldest), delete the rest
      const toDelete = rows.slice(1);
      await tx.personMediaLink.deleteMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
      });

      totalFixed += toDelete.length;
      details.push(
        `person ${dupe.personId.slice(0, 8)}… / media ${dupe.mediaItemId.slice(0, 8)}…: removed ${toDelete.length} duplicate(s)`,
      );
    }

    return {
      found: dupes.length,
      fixed: totalFixed,
      details,
    };
  });
}

// Static asset prefixes to ignore when checking for orphans (not media uploads)
const STATIC_PREFIXES = ["staging/", "body/", "flags/"];

/**
 * Cross-check every MediaItem's variant keys against MinIO.
 * Finds DB rows whose files are entirely missing (victim of the shallow-copy bug
 * or any other storage loss) and hard-deletes them.
 * Orphan MinIO objects (no DB row) are reported but not deleted.
 */
export async function auditMinioConsistency(): Promise<MaintenanceResult> {
  const bucket = getMinioBucket();

  // List all MinIO objects — one pass, then do in-memory lookups
  const minioKeys = new Set<string>();
  let continuationToken: string | undefined;
  do {
    const res = await minioClient.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) minioKeys.add(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  // Fetch all MediaItems
  const rows = await prisma.$queryRaw<Array<{ id: string; filename: string; variants: Record<string, string | undefined | null> | null }>>`
    SELECT id, filename, variants FROM "MediaItem"
  `;

  // Find fully broken items (every variant key missing from MinIO)
  const brokenIds: string[] = [];
  const details: string[] = [];
  let orphanCount = 0;

  const refKeys = new Set<string>();
  for (const row of rows) {
    if (!row.variants) continue;
    for (const v of Object.values(row.variants)) {
      if (typeof v === "string" && v.length > 0) refKeys.add(v);
    }
  }

  for (const row of rows) {
    const variantKeys = row.variants
      ? Object.values(row.variants).filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];

    if (variantKeys.length === 0) {
      brokenIds.push(row.id);
      details.push(`${row.filename} (no variants)`);
      continue;
    }

    const missing = variantKeys.filter((k) => !minioKeys.has(k));
    if (missing.length === variantKeys.length) {
      brokenIds.push(row.id);
      details.push(`${row.filename} (all ${variantKeys.length} variant files missing)`);
    }
  }

  // Count orphan MinIO objects (informational — not deleted)
  for (const key of minioKeys) {
    if (STATIC_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (!refKeys.has(key)) orphanCount++;
  }

  if (orphanCount > 0) {
    details.push(`${orphanCount} orphaned MinIO object(s) found (use CLI script to clean)`);
  }

  if (brokenIds.length === 0) {
    return { found: 0, fixed: 0, details: orphanCount > 0 ? details : [] };
  }

  // Cascade-delete broken DB rows — no deleteMediaFiles() needed (files already gone)
  await prisma.$transaction(async (tx) => {
    await cascadeHardDeleteMediaItems(tx, brokenIds);
  });

  return { found: brokenIds.length, fixed: brokenIds.length, details };
}

/**
 * Refresh all materialized views, reporting per-view success/failure.
 */
export async function refreshAllMaterializedViews(): Promise<MaintenanceResult> {
  const views = [
    { name: "mv_dashboard_stats", fn: refreshDashboardStats },
    { name: "mv_person_current_state", fn: refreshPersonCurrentState },
    { name: "mv_person_affiliations", fn: refreshPersonAffiliations },
  ];

  const details: string[] = [];
  let successCount = 0;

  for (const view of views) {
    try {
      await view.fn();
      successCount++;
      details.push(`${view.name}: refreshed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      details.push(`${view.name}: FAILED — ${message}`);
    }
  }

  return {
    found: views.length,
    fixed: successCount,
    details,
  };
}
