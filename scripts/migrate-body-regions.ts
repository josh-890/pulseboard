/**
 * Data migration: Ensure all bodyRegions arrays contain valid standardized
 * region IDs from lib/constants/body-regions.ts.
 *
 * Phase 1: Fix records where bodyRegions is empty — map from free-text bodyRegion field.
 * Phase 2: Fix records where bodyRegions contains invalid IDs — remap each invalid ID.
 *
 * Usage: npx tsx scripts/migrate-body-regions.ts
 *        npx tsx scripts/migrate-body-regions.ts --dry-run
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  mapFreeTextToRegions,
  isValidRegionId,
} from "../src/lib/constants/body-regions";

const dryRun = process.argv.includes("--dry-run");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/**
 * Manual corrections for invalid IDs that can't be resolved by mapFreeTextToRegions.
 * Maps an invalid stored ID → correct valid ID(s).
 */
const MANUAL_CORRECTIONS: Record<string, string[]> = {
  // Legacy dot-notation that doesn't match our sub-region convention
  "arm_l": ["upper_arm_l"],
  "arm_r": ["upper_arm_r"],
  "leg.knee.front_r": ["knee_r.front"],
  "leg.knee.front_l": ["knee_l.front"],
  "leg.knee.behind_r": ["knee_r.behind"],
  "leg.knee.behind_l": ["knee_l.behind"],
  "head.lip.upper": ["face.lips"],
  "head.lip.lower": ["face.lips"],
  "head.lips": ["face.lips"],
  "head.nose": ["face.nose"],
  "head.forehead": ["face.forehead"],
  "head.chin": ["face.chin"],
  "head.cheek_r": ["face.cheek_r"],
  "head.cheek_l": ["face.cheek_l"],
  "head.ear_r": ["face.ear_r"],
  "head.ear_l": ["face.ear_l"],
  "head.eyebrow_r": ["face.eyebrow_r"],
  "head.eyebrow_l": ["face.eyebrow_l"],
  "head.tongue": ["face.tongue"],
  "head.scalp": ["face.scalp"],
  "head.jaw_r": ["face.jaw_r"],
  "head.jaw_l": ["face.jaw_l"],
  // Renamed regions
  "abdomen_lower": ["abdomen_lower_r", "abdomen_lower_l"],
  "pubic.anal": ["pubic.anus"],
};

/** Resolve a single potentially-invalid region ID to valid IDs */
function resolveRegionId(id: string): string[] | null {
  if (isValidRegionId(id)) return null; // already valid, no change needed

  // Check manual corrections first
  if (MANUAL_CORRECTIONS[id]) return MANUAL_CORRECTIONS[id];

  // Try mapFreeTextToRegions on the raw ID
  const mapped = mapFreeTextToRegions(id);
  if (mapped.length > 0) return mapped;

  // Try treating dots as separators and mapping the last segment
  if (id.includes(".")) {
    const segments = id.split(".");
    const last = segments[segments.length - 1];
    const mapped2 = mapFreeTextToRegions(last);
    if (mapped2.length > 0) return mapped2;
  }

  return null; // cannot resolve
}

/** Fix an array of region IDs, returning corrected array or null if no changes */
function fixRegionIds(ids: string[]): { fixed: string[]; changes: string[] } | null {
  let changed = false;
  const changes: string[] = [];
  const result = new Set<string>();

  for (const id of ids) {
    const resolved = resolveRegionId(id);
    if (resolved === null) {
      // Already valid
      result.add(id);
    } else {
      changed = true;
      for (const r of resolved) result.add(r);
      changes.push(`"${id}" → [${resolved.join(", ")}]`);
    }
  }

  if (!changed) return null;
  return { fixed: Array.from(result), changes };
}

// ── Phase 1: Empty bodyRegions → map from free-text bodyRegion ──────────────

async function migrateEmpty(table: "bodyMark" | "bodyModification" | "cosmeticProcedure") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = prisma[table] as any;
  const hasSide = table !== "cosmeticProcedure";
  const select: Record<string, boolean> = { id: true, bodyRegion: true };
  if (hasSide) select.side = true;
  const records = await client.findMany({
    where: {
      OR: [
        { bodyRegions: { isEmpty: true } },
        { bodyRegions: { equals: null } },
      ],
    },
    select,
  });

  if (records.length === 0) return;
  console.log(`  Phase 1: ${records.length} records with empty bodyRegions`);

  for (const record of records) {
    const mapped = mapFreeTextToRegions(record.bodyRegion, record.side ?? null);
    if (mapped.length > 0) {
      if (!dryRun) {
        await client.update({
          where: { id: record.id },
          data: { bodyRegions: mapped },
        });
      }
      console.log(`    ${dryRun ? "[DRY] " : ""}[${record.id}] "${record.bodyRegion}" → [${mapped.join(", ")}]`);
    } else {
      console.log(`    [${record.id}] "${record.bodyRegion}" → NO MAPPING`);
    }
  }
}

// ── Phase 2: Fix invalid IDs in existing bodyRegions arrays ─────────────────

async function fixInvalidIds(table: "bodyMark" | "bodyModification" | "cosmeticProcedure") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = prisma[table] as any;
  const records = await client.findMany({
    where: { NOT: { bodyRegions: { isEmpty: true } } },
    select: { id: true, bodyRegion: true, bodyRegions: true },
  });

  const toFix = records.filter(
    (r: { bodyRegions: string[] }) => r.bodyRegions.some((id: string) => !isValidRegionId(id)),
  );

  if (toFix.length === 0) return;
  console.log(`  Phase 2: ${toFix.length} records with invalid region IDs`);

  for (const record of toFix) {
    const result = fixRegionIds(record.bodyRegions);
    if (result) {
      // Also update the legacy bodyRegion text field to match the primary region label
      if (!dryRun) {
        await client.update({
          where: { id: record.id },
          data: { bodyRegions: result.fixed },
        });
      }
      console.log(`    ${dryRun ? "[DRY] " : ""}[${record.id}] ${result.changes.join(", ")} → final: [${result.fixed.join(", ")}]`);
    } else {
      const invalids = record.bodyRegions.filter((id: string) => !isValidRegionId(id));
      console.log(`    [${record.id}] UNRESOLVED: [${invalids.join(", ")}]`);
    }
  }
}

// ── PersonMediaLink ─────────────────────────────────────────────────────────

async function migrateMediaLinks() {
  // Phase 1: empty bodyRegions
  const emptyLinks = await prisma.personMediaLink.findMany({
    where: {
      bodyRegion: { not: null },
      bodyRegions: { isEmpty: true },
    },
    select: { id: true, bodyRegion: true },
  });

  if (emptyLinks.length > 0) {
    console.log(`  Phase 1: ${emptyLinks.length} media links with empty bodyRegions`);
    for (const link of emptyLinks) {
      if (!link.bodyRegion) continue;
      const mapped = mapFreeTextToRegions(link.bodyRegion);
      if (mapped.length > 0) {
        if (!dryRun) {
          await prisma.personMediaLink.update({
            where: { id: link.id },
            data: { bodyRegions: mapped },
          });
        }
        console.log(`    ${dryRun ? "[DRY] " : ""}[${link.id}] "${link.bodyRegion}" → [${mapped.join(", ")}]`);
      } else {
        console.log(`    [${link.id}] "${link.bodyRegion}" → NO MAPPING`);
      }
    }
  }

  // Phase 2: fix invalid IDs
  const allLinks = await prisma.personMediaLink.findMany({
    where: { NOT: { bodyRegions: { isEmpty: true } } },
    select: { id: true, bodyRegion: true, bodyRegions: true },
  });

  const toFix = allLinks.filter((l) => l.bodyRegions.some((id) => !isValidRegionId(id)));
  if (toFix.length > 0) {
    console.log(`  Phase 2: ${toFix.length} media links with invalid region IDs`);
    for (const link of toFix) {
      const result = fixRegionIds(link.bodyRegions);
      if (result) {
        if (!dryRun) {
          await prisma.personMediaLink.update({
            where: { id: link.id },
            data: { bodyRegions: result.fixed },
          });
        }
        console.log(`    ${dryRun ? "[DRY] " : ""}[${link.id}] ${result.changes.join(", ")} → final: [${result.fixed.join(", ")}]`);
      } else {
        const invalids = link.bodyRegions.filter((id) => !isValidRegionId(id));
        console.log(`    [${link.id}] UNRESOLVED: [${invalids.join(", ")}]`);
      }
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Body region migration${dryRun ? " (DRY RUN)" : ""}\n`);

  for (const table of ["bodyMark", "bodyModification", "cosmeticProcedure"] as const) {
    console.log(`[${table}]`);
    await migrateEmpty(table);
    await fixInvalidIds(table);
  }

  console.log("\n[PersonMediaLink]");
  await migrateMediaLinks();

  console.log("\nMigration complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
