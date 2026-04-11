import { prisma } from "@/lib/db";
import { cascadeHardDeleteMediaItems } from "@/lib/services/cascade-helpers";
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
