import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

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
    requestHandler: new NodeHttpHandler({
      requestTimeout: 30_000,      // 30s per request
      connectionTimeout: 5_000,    // 5s to establish connection
    }),
  });
}

const globalForMinio = globalThis as unknown as {
  minioClient: S3Client | undefined;
};

export const minioClient =
  globalForMinio.minioClient ?? createMinioClient();

if (process.env.NODE_ENV !== "production") globalForMinio.minioClient = minioClient;

import { getCurrentTenantConfig } from "./tenant-context";
import { isSingleTenantMode } from "./tenants";

/**
 * Get the MinIO bucket for the current tenant.
 * In single-tenant mode, falls back to the MINIO_BUCKET env var.
 */
export function getMinioBucket(): string {
  if (isSingleTenantMode()) {
    return process.env.MINIO_BUCKET!;
  }
  return getCurrentTenantConfig().minioBucket;
}

/** @deprecated Use getMinioBucket() for tenant-aware bucket resolution */
export const MINIO_BUCKET = process.env.MINIO_BUCKET!;
