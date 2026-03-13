import { NextResponse } from "next/server";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, MINIO_BUCKET } from "@/lib/minio";

const CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";
const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

function flagKey(code: string): string {
  return `flags/${code}.svg`;
}

async function existsInMinio(key: string): Promise<boolean> {
  try {
    await minioClient.send(
      new HeadObjectCommand({ Bucket: MINIO_BUCKET, Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params;
  const code = rawCode.toLowerCase().replace(/[^a-z]/g, "");
  if (!code || code.length !== 2) {
    return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
  }

  const key = flagKey(code);

  // Already cached in MinIO — redirect to MinIO URL
  if (await existsInMinio(key)) {
    return NextResponse.redirect(`${BASE_URL}/${key}`);
  }

  // Download from CDN and upload to MinIO
  try {
    const res = await fetch(`${CDN_BASE}/${code}.svg`);
    if (!res.ok) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    const svg = Buffer.from(await res.arrayBuffer());

    await minioClient.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
        Body: svg,
        ContentType: "image/svg+xml",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    // Redirect to the now-cached MinIO URL
    return NextResponse.redirect(`${BASE_URL}/${key}`);
  } catch {
    return NextResponse.json({ error: "Failed to fetch flag" }, { status: 502 });
  }
}
