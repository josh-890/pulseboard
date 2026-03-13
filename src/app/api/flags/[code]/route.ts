import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, MINIO_BUCKET } from "@/lib/minio";

const CDN_BASE = "https://hatscripts.github.io/circle-flags/flags";
const SVG_HEADERS: HeadersInit = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=31536000, immutable",
};

function flagKey(code: string): string {
  return `flags/${code}.svg`;
}

async function getFromMinio(key: string): Promise<ArrayBuffer | null> {
  try {
    const res = await minioClient.send(
      new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return bytes?.buffer as ArrayBuffer | undefined ?? null;
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
    return Response.json({ error: "Invalid country code" }, { status: 400 });
  }

  const key = flagKey(code);

  // Try MinIO first
  const cached = await getFromMinio(key);
  if (cached) {
    return new Response(cached, { headers: SVG_HEADERS });
  }

  // Download from CDN, upload to MinIO, and serve
  try {
    const res = await fetch(`${CDN_BASE}/${code}.svg`);
    if (!res.ok) {
      return Response.json({ error: "Flag not found" }, { status: 404 });
    }

    const svg = await res.arrayBuffer();

    // Upload to MinIO in background — don't block the response
    minioClient
      .send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: key,
          Body: new Uint8Array(svg),
          ContentType: "image/svg+xml",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      )
      .catch(() => {});

    return new Response(svg, { headers: SVG_HEADERS });
  } catch {
    return Response.json({ error: "Failed to fetch flag" }, { status: 502 });
  }
}
