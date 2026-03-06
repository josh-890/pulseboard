import { prisma } from "@/lib/db";
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
 * and soft-delete them along with their PersonMediaLinks.
 */
export async function findAndFixOrphanedMedia(): Promise<MaintenanceResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Find orphaned media items — variants is null, empty, or missing "original"
    const orphans = await tx.$queryRaw<
      Array<{ id: string; filename: string }>
    >`
      SELECT id, filename
      FROM "MediaItem"
      WHERE "deletedAt" IS NULL
        AND (
          variants IS NULL
          OR variants::text = '{}'
          OR variants::text = 'null'
          OR NOT (variants ? 'original')
        )
    `;

    if (orphans.length === 0) {
      return { found: 0, fixed: 0, details: [] };
    }

    const ids = orphans.map((o) => o.id);

    // Soft-delete PersonMediaLinks referencing these items
    await tx.personMediaLink.updateMany({
      where: { mediaItemId: { in: ids }, deletedAt: null },
      data: { deletedAt: now },
    });

    // Soft-delete the MediaItems themselves
    await tx.mediaItem.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: now },
    });

    return {
      found: orphans.length,
      fixed: orphans.length,
      details: orphans.map((o) => o.filename),
    };
  });
}

/**
 * Find duplicate PersonMediaLink rows (same personId + mediaItemId, not soft-deleted)
 * and soft-delete all but the oldest per group.
 */
export async function findAndFixDuplicatePersonMediaLinks(): Promise<MaintenanceResult> {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // Find groups with duplicates
    const dupes = await tx.$queryRaw<
      Array<{ personId: string; mediaItemId: string; cnt: bigint }>
    >`
      SELECT "personId", "mediaItemId", COUNT(*) as cnt
      FROM "PersonMediaLink"
      WHERE "deletedAt" IS NULL
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

      // Keep the first (oldest), soft-delete the rest
      const toDelete = rows.slice(1);
      await tx.personMediaLink.updateMany({
        where: { id: { in: toDelete.map((r) => r.id) } },
        data: { deletedAt: now },
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
