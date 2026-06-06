import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { buildUrl } from "@/lib/media-url";

const MAX_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Pin a motif-template silhouette reference: store a single downscaled webp as a raw
 * object (no MediaItem / variants) and return its key + URL. The template's
 * `silhouetteRef` (key) is persisted by the normal template save; this route only
 * writes the bytes.
 */
export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      // Two modes: a multipart file upload, or JSON { sourceUrl } to copy an existing
      // image (e.g. a slot image picked from the library) server-side — no CORS, and
      // the reference survives even if the source photo is later deleted.
      let buffer: Buffer;
      if (request.headers.get("content-type")?.includes("application/json")) {
        const { sourceUrl } = (await request.json()) as { sourceUrl?: string };
        if (!sourceUrl) return NextResponse.json({ error: "No sourceUrl provided" }, { status: 400 });
        const src = await fetch(sourceUrl);
        if (!src.ok) return NextResponse.json({ error: "Could not fetch source image" }, { status: 400 });
        buffer = Buffer.from(await src.arrayBuffer());
      } else {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
        if (!ALLOWED_TYPES.has(file.type)) {
          return NextResponse.json({ error: "Invalid file type. Accepted: JPEG, PNG, WebP" }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
          return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
        }
        buffer = Buffer.from(await file.arrayBuffer());
      }
      const resized = await sharp(buffer)
        .rotate() // auto-orient from EXIF
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const key = `motifTemplates/${randomUUID()}/silhouette.webp`;
      await minioClient.send(
        new PutObjectCommand({
          Bucket: getMinioBucket(),
          Key: key,
          Body: resized,
          ContentType: "image/webp",
        }),
      );

      return NextResponse.json({ key, url: buildUrl(key) });
    } catch (err) {
      console.error("Silhouette upload error:", err);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  });
}
