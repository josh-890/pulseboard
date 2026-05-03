/**
 * Audit DB ↔ MinIO consistency for the xpulse tenant.
 *
 * Checks two directions:
 *   A. DB → MinIO: MediaItem rows whose variant keys don't exist in MinIO
 *      (FULLY_BROKEN = all variants missing, PARTIALLY_BROKEN = some missing)
 *   B. MinIO → DB: Objects in the bucket that no MediaItem references
 *      (orphan files — wasted storage, no broken photos)
 *
 * Usage:
 *   npx dotenv-cli -e .env.production -- npx tsx scripts/audit-xpulse-media.ts
 *   npx dotenv-cli -e .env.production -- npx tsx scripts/audit-xpulse-media.ts --repair
 *
 * --repair:
 *   - Deletes FULLY_BROKEN MediaItem rows from DB (cascade)
 *   - Deletes orphan MinIO objects from the bucket
 *   - PARTIALLY_BROKEN items are reported only (manual decision needed)
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// ── Config ────────────────────────────────────────────────────────────────────

const REPAIR = process.argv.includes("--repair");

const XPULSE_DB_URL = process.env.TENANT_XPULSE_DATABASE_URL!;
const XPULSE_BUCKET = process.env.TENANT_XPULSE_MINIO_BUCKET ?? "xpulseboard";

const endpoint = process.env.MINIO_ENDPOINT!;
const port     = process.env.MINIO_PORT!;
const useSSL   = process.env.MINIO_USE_SSL === "true";
const protocol = useSSL ? "https" : "http";

if (!XPULSE_DB_URL) {
  console.error("ERROR: TENANT_XPULSE_DATABASE_URL is not set.");
  console.error("Run with: npx dotenv-cli -e .env.production -- npx tsx scripts/audit-xpulse-media.ts");
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: XPULSE_DB_URL });
const prisma  = new PrismaClient({ adapter });

const s3 = new S3Client({
  endpoint: `${protocol}://${endpoint}:${port}`,
  region: "us-east-1",
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    requestTimeout: 30_000,
    connectionTimeout: 5_000,
  }),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaRow = {
  id: string;
  sessionId: string;
  filename: string;
  variants: Record<string, string | undefined | null> | null;
  createdAt: Date;
};

type BrokenItem = {
  id: string;
  sessionId: string;
  filename: string;
  totalVariants: number;
  missingKeys: string[];
};

// ── MinIO helpers ─────────────────────────────────────────────────────────────

async function listAllObjects(bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteObjects(bucket: string, keys: string[]): Promise<number> {
  let deleted = 0;
  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
    deleted += batch.length;
    console.log(`  Deleted batch ${Math.ceil((i + 1) / BATCH)}: ${batch.length} objects (${deleted} total)`);
  }
  return deleted;
}

// ── DB repair helpers ─────────────────────────────────────────────────────────

async function cascadeDeleteMediaItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  // Delete in dependency order — same as cascade-helpers.ts
  await prisma.personMediaLink.deleteMany({ where: { mediaItemId: { in: ids } } });
  await prisma.setMediaItem.deleteMany({ where: { mediaItemId: { in: ids } } });
  await prisma.mediaCollectionItem.deleteMany({ where: { mediaItemId: { in: ids } } });
  await prisma.skillEventMedia.deleteMany({ where: { mediaItemId: { in: ids } } });
  await prisma.mediaItemTag.deleteMany({ where: { mediaItemId: { in: ids } } });

  // Null out cover references
  await prisma.set.updateMany({ where: { coverMediaItemId: { in: ids } }, data: { coverMediaItemId: null } });
  await prisma.session.updateMany({ where: { coverMediaItemId: { in: ids } }, data: { coverMediaItemId: null } });

  await prisma.mediaItem.deleteMany({ where: { id: { in: ids } } });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  xpulse Media Consistency Audit`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Bucket : ${XPULSE_BUCKET}`);
  console.log(`DB     : ${XPULSE_DB_URL.replace(/:([^@:]+)@/, ":***@")}`);
  console.log(`Mode   : ${REPAIR ? "REPAIR (will mutate DB and MinIO)" : "AUDIT ONLY (read-only)"}\n`);

  // ── Step 1: List all MinIO objects ──────────────────────────────────────────
  console.log(`Listing objects in "${XPULSE_BUCKET}"...`);
  const allMinioKeys = await listAllObjects(XPULSE_BUCKET);
  const minioKeySet = new Set(allMinioKeys);
  console.log(`  ${allMinioKeys.length} objects in MinIO bucket\n`);

  // ── Step 2: Fetch all MediaItems from DB ────────────────────────────────────
  console.log(`Fetching MediaItems from DB...`);
  const rows = await prisma.$queryRaw<MediaRow[]>`
    SELECT id, "sessionId", filename, variants, "createdAt"
    FROM   "MediaItem"
    ORDER  BY "createdAt" ASC
  `;
  console.log(`  ${rows.length} MediaItem rows in DB\n`);

  // ── Step 3: Build set of all DB-referenced MinIO keys ───────────────────────
  const refKeySet = new Set<string>();
  for (const row of rows) {
    if (!row.variants) continue;
    for (const val of Object.values(row.variants)) {
      if (typeof val === "string" && val.length > 0) refKeySet.add(val);
    }
  }

  // ── Step 4: Direction A — Broken DB refs ────────────────────────────────────
  const fullyBroken: BrokenItem[] = [];
  const partiallyBroken: BrokenItem[] = [];

  for (const row of rows) {
    if (!row.variants) {
      // No variants at all — treat as fully broken
      fullyBroken.push({ id: row.id, sessionId: row.sessionId, filename: row.filename, totalVariants: 0, missingKeys: [] });
      continue;
    }

    const variantKeys = Object.values(row.variants).filter((v): v is string => typeof v === "string" && v.length > 0);
    if (variantKeys.length === 0) {
      fullyBroken.push({ id: row.id, sessionId: row.sessionId, filename: row.filename, totalVariants: 0, missingKeys: [] });
      continue;
    }

    const missingKeys = variantKeys.filter((k) => !minioKeySet.has(k));

    if (missingKeys.length === 0) continue; // OK

    const item: BrokenItem = {
      id: row.id,
      sessionId: row.sessionId,
      filename: row.filename,
      totalVariants: variantKeys.length,
      missingKeys,
    };

    if (missingKeys.length === variantKeys.length) {
      fullyBroken.push(item);
    } else {
      partiallyBroken.push(item);
    }
  }

  // ── Step 5: Direction B — Orphan MinIO files ────────────────────────────────
  // Skip known static asset prefixes: staging covers, body diagrams, flag SVGs
  const STATIC_PREFIXES = ["staging/", "body/", "flags/"];
  const orphanKeys: string[] = [];
  for (const key of allMinioKeys) {
    if (STATIC_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (!refKeySet.has(key)) orphanKeys.push(key);
  }

  // ── Step 6: Report ──────────────────────────────────────────────────────────
  const okCount = rows.length - fullyBroken.length - partiallyBroken.length;

  console.log(`${"─".repeat(60)}`);
  console.log(`Direction A — Broken DB refs (DB → MinIO)`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  FULLY_BROKEN      : ${fullyBroken.length} items (all variant files missing in MinIO)`);
  console.log(`  PARTIALLY_BROKEN  : ${partiallyBroken.length} items (some variant files missing)`);
  console.log(`  OK                : ${okCount} items`);

  if (fullyBroken.length > 0) {
    console.log(`\nFully broken items:`);
    for (const item of fullyBroken) {
      console.log(`  [${item.id}] ${item.filename}`);
      console.log(`    session: ${item.sessionId}`);
      if (item.missingKeys.length > 0) {
        console.log(`    missing: ${item.missingKeys.join(", ")}`);
      } else {
        console.log(`    (no variants in DB)`);
      }
    }
  }

  if (partiallyBroken.length > 0) {
    console.log(`\nPartially broken items:`);
    for (const item of partiallyBroken) {
      console.log(`  [${item.id}] ${item.filename}`);
      console.log(`    session: ${item.sessionId}`);
      console.log(`    total variants: ${item.totalVariants}, missing: ${item.missingKeys.length}`);
      console.log(`    missing keys: ${item.missingKeys.join(", ")}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Direction B — Orphan MinIO files (MinIO → DB)`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  Orphaned objects  : ${orphanKeys.length}`);
  if (orphanKeys.length > 0) {
    console.log(`\nFirst 20 orphaned keys:`);
    orphanKeys.slice(0, 20).forEach((k) => console.log(`  ${k}`));
    if (orphanKeys.length > 20) console.log(`  ... and ${orphanKeys.length - 20} more`);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Summary`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  DB rows total     : ${rows.length}`);
  console.log(`  OK                : ${okCount}`);
  console.log(`  Fully broken      : ${fullyBroken.length}`);
  console.log(`  Partially broken  : ${partiallyBroken.length}`);
  console.log(`  MinIO objects     : ${allMinioKeys.length}`);
  console.log(`  Orphan objects    : ${orphanKeys.length}`);

  if (!REPAIR) {
    console.log(`\nRe-run with --repair to:`);
    if (fullyBroken.length > 0) console.log(`  - Delete ${fullyBroken.length} fully broken DB rows (+ cascade relations)`);
    if (orphanKeys.length > 0) console.log(`  - Delete ${orphanKeys.length} orphaned MinIO objects`);
    if (partiallyBroken.length > 0) console.log(`  - (${partiallyBroken.length} partially broken items will NOT be auto-repaired — manual review needed)`);
    return;
  }

  // ── Step 7: Repair ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Repair`);
  console.log(`${"─".repeat(60)}`);

  if (fullyBroken.length > 0) {
    const ids = fullyBroken.map((i) => i.id);
    console.log(`\nDeleting ${ids.length} fully broken MediaItem rows from DB...`);
    await cascadeDeleteMediaItems(ids);
    console.log(`  Done.`);
  } else {
    console.log(`\nNo fully broken items to delete from DB.`);
  }

  if (orphanKeys.length > 0) {
    console.log(`\nDeleting ${orphanKeys.length} orphaned objects from MinIO...`);
    await deleteObjects(XPULSE_BUCKET, orphanKeys);
    console.log(`  Done.`);
  } else {
    console.log(`No orphaned MinIO objects to delete.`);
  }

  if (partiallyBroken.length > 0) {
    console.log(`\n${partiallyBroken.length} partially broken items require manual review.`);
    console.log(`If master_4000 still exists in MinIO for these items, missing variants`);
    console.log(`can be regenerated by downloading the master and re-running sharp.`);
  }

  console.log(`\nRepair complete.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
