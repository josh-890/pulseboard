/**
 * One-time migration: generate master_4000 + view_1200 + full_2400 for all
 * existing MediaItems that have an `original` variant but no `master_4000`.
 *
 * Run against production:
 *   npx dotenv -e .env.production -- npx tsx scripts/migrate-to-master4000.ts
 */

import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// ── Types ─────────────────────────────────────────────────────────────────────

type PhotoVariants = Record<string, string | undefined>;

type ItemRow = {
  id: string;
  variants: PhotoVariants;
  originalWidth: number;
  originalHeight: number;
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

// ── Sharp constants (must match media-upload.ts) ──────────────────────────────

const MASTER_MAX_SIDE = 4000;
const MASTER_QUALITY  = 88;

const GALLERY_VARIANTS = [
  { name: "gallery_512", maxSide: 512,  quality: 85 },
  { name: "view_1200",   maxSide: 1200, quality: 83 },
  { name: "full_2400",   maxSide: 2400, quality: 85 },
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

async function downloadFromMinio(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty body for key: ${key}`);
  return Buffer.from(await res.Body.transformToByteArray());
}

// ── Per-tenant processing ─────────────────────────────────────────────────────

async function processTenant(
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
    const rows = await prisma.$queryRaw<ItemRow[]>`
      SELECT id,
             variants,
             "originalWidth",
             "originalHeight",
             filename
      FROM   "MediaItem"
      WHERE  variants->>'master_4000' IS NULL
        AND  variants->>'original'    IS NOT NULL
      ORDER  BY "createdAt" ASC
    `;

    console.log(`Found ${rows.length} item(s) to migrate.\n`);

    let ok      = 0;
    let skipped = 0;
    let failed  = 0;

    for (let i = 0; i < rows.length; i++) {
      const item    = rows[i];
      const variants = (item.variants ?? {}) as PhotoVariants;
      const originalKey = variants.original;

      if (!originalKey) {
        console.log(`[${i + 1}/${rows.length}] SKIP (no original key): ${item.filename}`);
        skipped++;
        continue;
      }

      process.stdout.write(`[${i + 1}/${rows.length}] ${item.filename} … `);

      try {
        // Download original from MinIO
        const buffer = await downloadFromMinio(minio, tenant.bucket, originalKey);

        // Normalize (same pipeline as upload)
        const normalized = await sharp(buffer)
          .rotate()
          .withMetadata({ orientation: undefined })
          .toColorspace("srgb")
          .toBuffer();

        const updated = { ...variants };
        const prefix  = originalKey.substring(0, originalKey.lastIndexOf("/"));
        const added: string[] = [];

        // ── master_4000 ──────────────────────────────────────────────────────
        {
          const masterBuf = await sharp(normalized)
            .resize({ width: MASTER_MAX_SIDE, height: MASTER_MAX_SIDE, fit: "inside", withoutEnlargement: true })
            .webp({ quality: MASTER_QUALITY })
            .toBuffer();
          const key = `${prefix}/master_4000.webp`;
          await minio.send(new PutObjectCommand({
            Bucket: tenant.bucket, Key: key, Body: masterBuf, ContentType: "image/webp",
          }));
          updated.master_4000 = key;
          added.push("master_4000");
        }

        // ── gallery variants (only if missing + image is large enough) ───────
        const longestSide = Math.max(item.originalWidth, item.originalHeight);
        for (const v of GALLERY_VARIANTS) {
          if (updated[v.name]) continue;              // already exists
          if (longestSide <= v.maxSide) continue;     // too small — skip

          const variantBuf = await sharp(normalized)
            .resize({ width: v.maxSide, height: v.maxSide, fit: "inside", withoutEnlargement: true })
            .toFormat("webp", { quality: v.quality })
            .toBuffer();
          const key = `${prefix}/${v.name}.webp`;
          await minio.send(new PutObjectCommand({
            Bucket: tenant.bucket, Key: key, Body: variantBuf, ContentType: "image/webp",
          }));
          updated[v.name] = key;
          added.push(v.name);
        }

        // ── persist updated variants ─────────────────────────────────────────
        await prisma.mediaItem.update({
          where: { id: item.id },
          data:  { variants: updated as unknown as Record<string, string> },
        });

        console.log(`OK  [${added.join(", ")}]`);
        ok++;
      } catch (err) {
        console.log(`FAIL  ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }

    console.log(`\n${tenant.name} complete: ${ok} migrated, ${skipped} skipped, ${failed} failed.`);
  } finally {
    await prisma.$disconnect();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load .env.production when invoked via dotenv CLI wrapper
  if (!process.env.TENANT_PULSE_DATABASE_URL) {
    console.error("ERROR: TENANT_PULSE_DATABASE_URL not set.");
    console.error("Run with: npx dotenv -e .env.production -- npx tsx scripts/migrate-to-master4000.ts");
    process.exit(1);
  }

  const minio = createMinioClient();

  for (const tenant of TENANTS) {
    await processTenant(tenant, minio);
  }

  console.log("\n✓ All tenants done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
