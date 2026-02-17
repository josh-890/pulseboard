import { S3Client } from "@aws-sdk/client-s3";

function createMinioClient() {
  const endpoint = process.env.MINIO_ENDPOINT!;
  const port = process.env.MINIO_PORT!;
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const protocol = useSSL ? "https" : "http";

  return new S3Client({
    endpoint: `${protocol}://${endpoint}:${port}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

const globalForMinio = globalThis as unknown as {
  minioClient: S3Client | undefined;
};

export const minioClient =
  globalForMinio.minioClient ?? createMinioClient();

if (process.env.NODE_ENV !== "production") globalForMinio.minioClient = minioClient;

export const MINIO_BUCKET = process.env.MINIO_BUCKET!;
