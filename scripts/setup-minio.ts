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

async function main() {
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
  console.log("Public-read policy applied.");
  console.log("Done!");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
