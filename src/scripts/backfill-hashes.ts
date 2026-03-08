/**
 * Backfill SHA-256 and dHash for existing MediaItems.
 *
 * Usage: npx tsx src/scripts/backfill-hashes.ts
 *
 * Loads .env automatically (via dotenv/config) for DATABASE_URL and MinIO creds.
 */

import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { computeSha256, computeDHash } from "@/lib/image-hash";

// ─── Setup ──────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const minioEndpoint = process.env.MINIO_ENDPOINT!;
const minioPort = process.env.MINIO_PORT!;
const useSSL = process.env.MINIO_USE_SSL === "true";
const protocol = useSSL ? "https" : "http";

const minio = new S3Client({
  endpoint: `${protocol}://${minioEndpoint}:${minioPort}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET!;
const BATCH_SIZE = 50;

type PhotoVariants = {
  original?: string;
  [key: string]: string | undefined;
};

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Count items needing backfill
  const total = await prisma.mediaItem.count({
    where: {
      hash: null,

    },
  });

  console.log(`Found ${total} media items needing hash backfill`);

  if (total === 0) {
    console.log("Nothing to do.");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches using cursor-based pagination
  let cursor: string | undefined;

  while (true) {
    const items = await prisma.mediaItem.findMany({
      where: {
        hash: null,
  
      },
      select: {
        id: true,
        filename: true,
        variants: true,
        fileRef: true,
      },
      take: BATCH_SIZE,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
      orderBy: { id: "asc" },
    });

    if (items.length === 0) break;
    cursor = items[items.length - 1].id;

    for (const item of items) {
      const variants = (item.variants ?? {}) as PhotoVariants;
      const originalKey = variants.original ?? item.fileRef;

      if (!originalKey) {
        skipped++;
        console.log(`[${processed + skipped + errors}/${total}] Skipped ${item.filename} (no original)`);
        continue;
      }

      try {
        const response = await minio.send(
          new GetObjectCommand({
            Bucket: BUCKET,
            Key: originalKey,
          }),
        );

        if (!response.Body) {
          skipped++;
          console.log(`[${processed + skipped + errors}/${total}] Skipped ${item.filename} (empty body)`);
          continue;
        }

        const bodyBytes = await response.Body.transformToByteArray();
        const buffer = Buffer.from(bodyBytes);

        const hash = computeSha256(buffer);
        const phash = await computeDHash(buffer);

        await prisma.mediaItem.update({
          where: { id: item.id },
          data: { hash, phash },
        });

        processed++;
        console.log(`[${processed + skipped + errors}/${total}] Hashed ${item.filename}`);
      } catch (err) {
        errors++;
        console.error(
          `[${processed + skipped + errors}/${total}] Error hashing ${item.filename}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
