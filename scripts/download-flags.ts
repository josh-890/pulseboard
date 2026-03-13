import "dotenv/config";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { COUNTRIES } from "../src/lib/constants/countries";

const CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";

const endpoint = process.env.MINIO_ENDPOINT!;
const port = process.env.MINIO_PORT!;
const useSSL = process.env.MINIO_USE_SSL === "true";
const protocol = useSSL ? "https" : "http";
const bucket = process.env.MINIO_BUCKET!;

const client = new S3Client({
  endpoint: `${protocol}://${endpoint}:${port}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

async function existsInMinio(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Uploading flags to MinIO bucket "${bucket}" at ${protocol}://${endpoint}:${port}\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const country of COUNTRIES) {
    const code = country.code.toLowerCase();
    const key = `flags/${code}.svg`;

    if (await existsInMinio(key)) {
      skipped++;
      continue;
    }

    try {
      const res = await fetch(`${CDN_BASE}/${code}.svg`);
      if (!res.ok) {
        console.error(`  FAIL: ${country.code} (${country.name}) — HTTP ${res.status}`);
        failed++;
        continue;
      }

      const svg = Buffer.from(await res.arrayBuffer());
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: svg,
          ContentType: "image/svg+xml",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      uploaded++;
      process.stdout.write(`  ${country.code}`);
    } catch (err) {
      console.error(`  FAIL: ${country.code} (${country.name}) — ${err}`);
      failed++;
    }
  }

  console.log(`\n\nDone: ${uploaded} uploaded, ${skipped} already in MinIO, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
