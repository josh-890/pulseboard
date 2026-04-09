/**
 * One-time cleanup: delete raw `original` MinIO objects for all MediaItems
 * that now have a `master_4000` variant, then strip the `original` key from
 * the variants JSONB so the DB stays consistent.
 *
 * Run against production:
 *   npx dotenv-cli -e .env.production -- npx tsx scripts/cleanup-original-variants.ts
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

// ── Types ─────────────────────────────────────────────────────────────────────

type PhotoVariants = Record<string, string | undefined>;

type ItemRow = {
  id: string;
  variants: PhotoVariants;
  filename: string;
};

// ── Tenant config ─────────────────────────────────────────────────────────────

const TENANTS = [
  {
    name: "pulse",
    dbUrl: process.env.TENANT_PULSE_DATABASE_URL ?? process.env.DATABASE_URL!,
    bucket: process.env.TENANT_PULSE_MINIO_BUCKET ?? process.env.MINIO_BUCKET!,
  },
  {
    name: "xpulse",
    dbUrl: process.env.TENANT_XPULSE_DATABASE_URL!,
    bucket: process.env.TENANT_XPULSE_MINIO_BUCKET!,
  },
];

// ── MinIO client ──────────────────────────────────────────────────────────────

function createMinioClient(): S3Client {
  const endpoint = process.env.MINIO_ENDPOINT!;
  const port     = process.env.MINIO_PORT!;
  const useSSL   = process.env.MINIO_USE_SSL === "true";
  return new S3Client({
    endpoint: `${useSSL ? "https" : "http"}://${endpoint}:${port}`,
    region: "us-east-1",
    credentials: {
      accessKeyId:     process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

// ── Per-tenant cleanup ────────────────────────────────────────────────────────

async function cleanupTenant(
  tenant: { name: string; dbUrl: string; bucket: string },
  minio: S3Client,
): Promise<void> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Tenant : ${tenant.name}`);
  console.log(`DB     : ${tenant.dbUrl.replace(/:[^@]+@/, ":***@")}`);
  console.log(`Bucket : ${tenant.bucket}`);
  console.log("─".repeat(60));

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: tenant.dbUrl }),
  });

  try {
    // Items that have both master_4000 AND original — safe to clean
    const rows = await prisma.$queryRaw<ItemRow[]>`
      SELECT id, variants, filename
      FROM   "MediaItem"
      WHERE  variants->>'master_4000' IS NOT NULL
        AND  variants->>'original'    IS NOT NULL
      ORDER  BY "createdAt" ASC
    `;

    console.log(`Found ${rows.length} item(s) to clean.\n`);

    if (rows.length === 0) {
      console.log(`${tenant.name}: nothing to do.`);
      return;
    }

    // Collect all original keys to delete from MinIO
    const keysToDelete: string[] = [];
    for (const row of rows) {
      const key = row.variants.original;
      if (key) keysToDelete.push(key);
    }

    // Delete from MinIO in batches of 1000
    const BATCH = 1000;
    let minioDeleted = 0;
    let minioFailed  = 0;
    for (let i = 0; i < keysToDelete.length; i += BATCH) {
      const batch = keysToDelete.slice(i, i + BATCH);
      try {
        await minio.send(new DeleteObjectsCommand({
          Bucket: tenant.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: false,
          },
        }));
        minioDeleted += batch.length;
        process.stdout.write(`  MinIO: deleted ${minioDeleted}/${keysToDelete.length} objects\r`);
      } catch (err) {
        console.error(`\n  MinIO batch delete failed: ${err instanceof Error ? err.message : String(err)}`);
        minioFailed += batch.length;
      }
    }
    console.log(`\n  MinIO: ${minioDeleted} deleted, ${minioFailed} failed.`);

    // Strip `original` key from variants JSONB in DB
    const result = await prisma.$executeRaw`
      UPDATE "MediaItem"
      SET    variants = variants - 'original'
      WHERE  variants->>'master_4000' IS NOT NULL
        AND  variants->>'original'    IS NOT NULL
    `;
    console.log(`  DB: stripped 'original' key from ${result} row(s).`);

    console.log(`\n${tenant.name} complete.`);
  } finally {
    await prisma.$disconnect();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.TENANT_PULSE_DATABASE_URL) {
    console.error("ERROR: TENANT_PULSE_DATABASE_URL not set.");
    console.error("Run with: npx dotenv-cli -e .env.production -- npx tsx scripts/cleanup-original-variants.ts");
    process.exit(1);
  }

  const minio = createMinioClient();

  for (const tenant of TENANTS) {
    await cleanupTenant(tenant, minio);
  }

  console.log("\n✓ All tenants done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
