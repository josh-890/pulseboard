/**
 * Measure color / black & white for photos that have no tone yet (ADR-0041).
 * New uploads are measured on the way in; this fills in everything older.
 *
 * Reads the small gallery_512 variant from MinIO (enough at the 64 px the
 * measurement works at), writes MediaItem.tone + chroma. Photos set by hand are
 * never touched (they have a tone already). Resumable: it only picks photos
 * whose tone is still null, walking by id.
 *
 *   npx tsx scripts/backfill-media-tone.ts                       # dev (.env)
 *   npx tsx scripts/backfill-media-tone.ts --prod --tenant=xpulse
 *   ... --dry-run   measure and report, write nothing
 *   ... --limit=500 stop after N photos
 *   ... --bucket=NAME read the images from another bucket (dev holds xpulse data,
 *       whose files live in the xpulse bucket)
 */

import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { measureTone } from "../src/lib/image-tone";
import { TONE_BORDER } from "../src/lib/tone";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

dotenv.config({ path: flag("prod") ? ".env.production" : ".env" });

const DRY = flag("dry-run");
const LIMIT = opt("limit") ? Number(opt("limit")) : Infinity;
const BATCH = 200;
const CONCURRENCY = 12;

function tenantConfig(): { name: string; dbUrl: string; bucket: string } {
  const tenant = opt("tenant");
  if (!tenant) return { name: "default", dbUrl: process.env.DATABASE_URL!, bucket: process.env.MINIO_BUCKET! };
  const key = tenant.toUpperCase();
  const dbUrl = process.env[`TENANT_${key}_DATABASE_URL`];
  const bucket = process.env[`TENANT_${key}_MINIO_BUCKET`];
  if (!dbUrl || !bucket) throw new Error(`No database / bucket configured for tenant ${tenant}`);
  return { name: tenant, dbUrl, bucket };
}

function withBucketOverride(t: { name: string; dbUrl: string; bucket: string }) {
  const b = opt("bucket");
  return b ? { ...t, bucket: b } : t;
}

function minio(): S3Client {
  const useSSL = process.env.MINIO_USE_SSL === "true";
  return new S3Client({
    endpoint: `${useSSL ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: "us-east-1",
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY!, secretAccessKey: process.env.MINIO_SECRET_KEY! },
    forcePathStyle: true,
  });
}

async function main() {
  const t = withBucketOverride(tenantConfig());
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: t.dbUrl }) });
  const s3 = minio();
  const todo = await prisma.mediaItem.count({ where: { mediaType: "PHOTO", tone: null } });
  console.log(`[tone] ${t.name}: ${todo} photos to measure${DRY ? " (dry run)" : ""}`);

  let cursor: string | undefined;
  let done = 0;
  let mono = 0;
  let border = 0;
  let failed = 0;
  const started = Date.now();

  while (done + failed < LIMIT) {
    const batch = await prisma.mediaItem.findMany({
      where: { mediaType: "PHOTO", tone: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, variants: true, fileRef: true },
      orderBy: { id: "asc" },
      take: Math.min(BATCH, LIMIT - done - failed),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    let i = 0;
    const work = async () => {
      while (i < batch.length) {
        const it = batch[i++]!;
        const v = (it.variants ?? {}) as Record<string, string | undefined>;
        const key = v.gallery_512 ?? v.view_1200 ?? v.master_4000 ?? v.original ?? it.fileRef ?? undefined;
        if (!key) {
          failed++;
          continue;
        }
        try {
          const obj = await s3.send(new GetObjectCommand({ Bucket: t.bucket, Key: key }));
          const buf = Buffer.from(await obj.Body!.transformToByteArray());
          const { tone, chroma } = await measureTone(buf);
          if (tone === "MONO") mono++;
          if (chroma >= TONE_BORDER[0] && chroma <= TONE_BORDER[1]) border++;
          // Only while still unmeasured: a hand decision made meanwhile wins
          if (!DRY) await prisma.mediaItem.updateMany({ where: { id: it.id, tone: null }, data: { tone, chroma } });
          done++;
        } catch (err) {
          failed++;
          console.warn(`[tone] ${it.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, work));
    const rate = done / ((Date.now() - started) / 1000);
    console.log(`[tone] ${done}/${todo} measured · ${mono} B&W · ${border} borderline · ${failed} failed · ${rate.toFixed(1)}/s`);
  }

  console.log(`[tone] ${t.name} done: ${done} measured, ${mono} B&W, ${border} borderline, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
