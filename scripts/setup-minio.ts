import "dotenv/config";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.MINIO_ENDPOINT!;
const port = process.env.MINIO_PORT!;
const useSSL = process.env.MINIO_USE_SSL === "true";
const protocol = useSSL ? "https" : "http";

const client = new S3Client({
  endpoint: `${protocol}://${endpoint}:${port}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
});

async function ensureBucket(bucket: string) {
  console.log(`Checking bucket "${bucket}" on ${protocol}://${endpoint}:${port}...`);

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket "${bucket}" already exists.`);
  } catch {
    console.log(`Bucket "${bucket}" not found — creating...`);
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Bucket "${bucket}" created.`);
  }

  // Set public-read policy (internal network only)
  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicRead",
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  };

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    }),
  );
  console.log(`Public-read policy applied to "${bucket}".`);
}

async function main() {
  const buckets: string[] = [];

  // Multi-tenant mode: set up buckets for all tenants
  const registry = process.env.TENANT_REGISTRY;
  if (registry) {
    const tenantIds = registry.split(",").map((s) => s.trim());
    for (const id of tenantIds) {
      const upper = id.toUpperCase();
      const bucket = process.env[`TENANT_${upper}_MINIO_BUCKET`];
      if (bucket) {
        buckets.push(bucket);
      } else {
        console.warn(`WARNING: TENANT_${upper}_MINIO_BUCKET not set, skipping tenant "${id}"`);
      }
    }
  }

  // Single-tenant fallback
  if (buckets.length === 0) {
    const bucket = process.env.MINIO_BUCKET;
    if (!bucket) {
      console.error("ERROR: No MINIO_BUCKET or TENANT_*_MINIO_BUCKET configured.");
      process.exit(1);
    }
    buckets.push(bucket);
  }

  for (const bucket of buckets) {
    await ensureBucket(bucket);
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
