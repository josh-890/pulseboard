import sharp from "sharp";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import { minioClient, getMinioBucket } from "@/lib/minio";
import { isBrandColorKey, isBrandFontKey } from "@/lib/brand-mark";
import { BRAND_SELECT, type BrandRow } from "@/lib/services/brand-of";

// Brand marks of channels, labels and artists: an uploaded logo (an artist's
// portrait) or the generated wordmark with optional font/colour overrides.

export type BrandKind = "channel" | "label" | "artist";

const LOGO_MAX_PX = 512;

async function readBrand(kind: BrandKind, id: string): Promise<BrandRow> {
  switch (kind) {
    case "channel":
      return prisma.channel.findUniqueOrThrow({ where: { id }, select: BRAND_SELECT });
    case "label":
      return prisma.label.findUniqueOrThrow({ where: { id }, select: BRAND_SELECT });
    case "artist":
      return prisma.artist.findUniqueOrThrow({ where: { id }, select: BRAND_SELECT });
  }
}

async function writeBrand(kind: BrandKind, id: string, data: Partial<BrandRow>): Promise<void> {
  switch (kind) {
    case "channel":
      await prisma.channel.update({ where: { id }, data });
      return;
    case "label":
      await prisma.label.update({ where: { id }, data });
      return;
    case "artist":
      await prisma.artist.update({ where: { id }, data });
      return;
  }
}

async function removeObject(key: string | null): Promise<void> {
  if (!key) return;
  await minioClient
    .send(new DeleteObjectCommand({ Bucket: getMinioBucket(), Key: key }))
    .catch((err) => console.error("[brand-service] old logo not removed", key, err));
}

/**
 * Store an uploaded logo: strictly decoded (a damaged file is refused with the
 * reason), at most 512 px, WebP — transparency kept. Replaces the previous one.
 */
export async function setBrandLogo(kind: BrandKind, id: string, buffer: Buffer): Promise<{ url: string }> {
  const before = await readBrand(kind, id);
  const processed = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({ width: LOGO_MAX_PX, height: LOGO_MAX_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  const key = `brand/${kind}/${id}-${Date.now()}.webp`;
  await minioClient.send(
    new PutObjectCommand({ Bucket: getMinioBucket(), Key: key, Body: processed, ContentType: "image/webp" }),
  );
  await writeBrand(kind, id, { logoKey: key });
  await removeObject(before.logoKey);
  return { url: buildUrl(key) };
}

/** Back to the generated mark */
export async function clearBrandLogo(kind: BrandKind, id: string): Promise<void> {
  const before = await readBrand(kind, id);
  await writeBrand(kind, id, { logoKey: null });
  await removeObject(before.logoKey);
}

/** Font and colour of the generated mark; null = the pick from the name */
export async function setBrandStyle(
  kind: BrandKind,
  id: string,
  style: { markFont: string | null; markColor: string | null },
): Promise<void> {
  if (style.markFont !== null && !isBrandFontKey(style.markFont)) throw new Error(`Unknown font "${style.markFont}"`);
  if (style.markColor !== null && !isBrandColorKey(style.markColor)) throw new Error(`Unknown colour "${style.markColor}"`);
  await writeBrand(kind, id, style);
}
