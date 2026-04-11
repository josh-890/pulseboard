/**
 * Purge orphaned MinIO objects from the xpulseboard bucket.
 *
 * After the accidental deletion of all MediaItem rows from xpulseboard,
 * every object in that bucket (except staging covers) is now orphaned.
 * This script:
 *   1. Counts existing MediaItem rows in the xpulseboard DB (should be 0)
 *   2. Lists all objects in the xpulseboard MinIO bucket
 *   3. Identifies orphaned objects: any object whose path-encoded mediaItemId
 *      does not match a live MediaItem in the DB
 *      (staging/* objects are always skipped)
 *   4. Deletes them in batches of 1000 (S3 API limit)
 *
 * Usage:
 *   npx tsx scripts/purge-xpulse-minio.ts           # dry-run (no deletes)
 *   npx tsx scripts/purge-xpulse-minio.ts --confirm  # actually delete
 */

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = !process.argv.includes("--confirm");

const XPULSE_DB_URL = process.env.TENANT_XPULSE_DATABASE_URL!;
const XPULSE_BUCKET = process.env.TENANT_XPULSE_MINIO_BUCKET ?? "xpulseboard";

const endpoint = process.env.MINIO_ENDPOINT!;
const port = process.env.MINIO_PORT!;
const useSSL = process.env.MINIO_USE_SSL === "true";
const protocol = useSSL ? "https" : "http";

if (!XPULSE_DB_URL) {
  console.error("ERROR: TENANT_XPULSE_DATABASE_URL is not set in .env.production");
  process.exit(1);
}

// ── Clients ───────────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: XPULSE_DB_URL });
const prisma = new PrismaClient({ adapter });

const s3 = new S3Client({
  endpoint: `${protocol}://${endpoint}:${port}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestHandler: new NodeHttpHandler({
    requestTimeout: 30_000,
    connectionTimeout: 5_000,
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the mediaItemId encoded in the object key.
 * Expected formats:
 *   {entityType}/{entityId}/{mediaItemId}/{variant}.webp
 *   staging/{id}/cover-{timestamp}.jpg   ← skip these
 */
function extractMediaItemId(key: string): string | null {
  if (key.startsWith("staging/")) return null; // skip staging covers
  const parts = key.split("/");
  // parts[0]=entityType, parts[1]=entityId, parts[2]=mediaItemId, parts[3]=variant
  if (parts.length >= 3) return parts[2];
  return null;
}

async function listAllObjects(bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    });
    const res = await s3.send(cmd);
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteObjects(bucket: string, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  let deleted = 0;

  const BATCH = 1000;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    deleted += batch.length;
    console.log(`  Deleted batch ${Math.floor(i / BATCH) + 1}: ${batch.length} objects (${deleted} total)`);
  }
  return deleted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== xpulseboard MinIO Purge ===`);
  console.log(`Bucket : ${XPULSE_BUCKET}`);
  console.log(`DB     : ${XPULSE_DB_URL.replace(/:([^@:]+)@/, ":***@")}`);
  console.log(`Mode   : ${DRY_RUN ? "DRY RUN (pass --confirm to delete)" : "LIVE — will delete"}\n`);

  // Step 1: confirm DB state
  const liveCount = await prisma.mediaItem.count();
  console.log(`MediaItem rows in xpulseboard DB: ${liveCount}`);
  if (liveCount > 0) {
    console.log("\nLive MediaItems detected — fetching IDs for cross-reference...");
  }
  const liveIds = new Set(
    (await prisma.mediaItem.findMany({ select: { id: true } })).map((m) => m.id),
  );

  // Step 2: list all objects
  console.log(`\nListing objects in bucket "${XPULSE_BUCKET}"...`);
  const allKeys = await listAllObjects(XPULSE_BUCKET);
  console.log(`Total objects in bucket: ${allKeys.length}`);

  // Step 3: classify
  const orphaned: string[] = [];
  const skipped: string[] = [];
  const kept: string[] = [];

  for (const key of allKeys) {
    if (key.startsWith("staging/")) {
      skipped.push(key);
      continue;
    }
    const mediaId = extractMediaItemId(key);
    if (mediaId === null) {
      // Path doesn't match the expected media upload format — skip (static assets etc.)
      skipped.push(key);
      continue;
    }
    if (liveIds.has(mediaId)) {
      kept.push(key);
    } else {
      orphaned.push(key);
    }
  }

  console.log(`\nClassification:`);
  console.log(`  Staging (skipped)     : ${skipped.length}`);
  console.log(`  Has live DB record    : ${kept.length}`);
  console.log(`  Orphaned (to delete)  : ${orphaned.length}`);

  if (orphaned.length === 0) {
    console.log("\nNo orphaned objects found. Nothing to do.");
    return;
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN — first 20 orphaned keys:`);
    orphaned.slice(0, 20).forEach((k) => console.log(`  ${k}`));
    if (orphaned.length > 20) console.log(`  ... and ${orphaned.length - 20} more`);
    console.log(`\nRe-run with --confirm to delete ${orphaned.length} objects.`);
    return;
  }

  // Step 4: delete
  console.log(`\nDeleting ${orphaned.length} orphaned objects...`);
  const deleted = await deleteObjects(XPULSE_BUCKET, orphaned);
  console.log(`\nDone. Deleted ${deleted} objects from "${XPULSE_BUCKET}".`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
