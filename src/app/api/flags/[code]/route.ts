import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, MINIO_BUCKET } from "@/lib/minio";

const CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";
const SVG_HEADERS = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=31536000, immutable",
};

function flagKey(code: string): string {
  return `flags/${code}.svg`;
}

async function getFromMinio(key: string): Promise<Buffer | null> {
  try {
    const res = await minioClient.send(
      new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
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

  // Try MinIO first
  const cached = await getFromMinio(key);
  if (cached) {
    return new NextResponse(cached, { headers: SVG_HEADERS });
  }

  // Download from CDN, upload to MinIO, and serve
  try {
    const res = await fetch(`${CDN_BASE}/${code}.svg`);
    if (!res.ok) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    const svg = Buffer.from(await res.arrayBuffer());

    // Upload to MinIO in background — don't block the response
    minioClient
      .send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: key,
          Body: svg,
          ContentType: "image/svg+xml",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      )
      .catch(() => {});

    return new NextResponse(svg, { headers: SVG_HEADERS });
  } catch {
    return NextResponse.json({ error: "Failed to fetch flag" }, { status: 502 });
  }
}
