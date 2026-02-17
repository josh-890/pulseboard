import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, MINIO_BUCKET } from "./minio";

type ProfileVariant = {
  name: string;
  width: number;
  height: number;
};

type GalleryVariant = {
  name: string;
  width: number;
};

const PROFILE_VARIANTS: ProfileVariant[] = [
  { name: "profile_128", width: 128, height: 160 },
  { name: "profile_256", width: 256, height: 320 },
  { name: "profile_512", width: 512, height: 640 },
  { name: "profile_768", width: 768, height: 960 },
];

const GALLERY_VARIANTS: GalleryVariant[] = [
  { name: "gallery_512", width: 512 },
  { name: "gallery_1024", width: 1024 },
  { name: "gallery_1600", width: 1600 },
];

function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimeType] ?? "jpg";
}

export type PhotoVariants = {
  original: string;
  profile_128?: string;
  profile_256?: string;
  profile_512?: string;
  profile_768?: string;
  gallery_512?: string;
  gallery_1024?: string;
  gallery_1600?: string;
};

export type UploadResult = {
  variants: PhotoVariants;
  originalWidth: number;
  originalHeight: number;
};

export async function uploadPhotoToStorage(
  buffer: Buffer,
  mimeType: string,
  entityType: string,
  entityId: string,
  photoId: string,
): Promise<UploadResult> {
  const ext = mimeToExtension(mimeType);
  const prefix = `${entityType}/${entityId}/${photoId}`;

  // Step 1 — Validate decodable via sharp metadata (magic bytes)
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error("Image could not be decoded");
  }

  // Step 2 — Normalize: auto-rotate EXIF, strip metadata, normalize colorspace
  const normalized = await sharp(buffer)
    .rotate()
    .withMetadata({ orientation: undefined })
    .toColorspace("srgb")
    .toBuffer();

  // Upload original (native format)
  const keyOriginal = `${prefix}/original.${ext}`;
  await minioClient.send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: keyOriginal,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const variants: PhotoVariants = { original: keyOriginal };

  // Generate profile variants (4:5 cover crop, WebP)
  for (const variant of PROFILE_VARIANTS) {
    // Skip if original is smaller than this variant width
    if (originalWidth < variant.width && originalHeight < variant.height) continue;

    const variantBuffer = await sharp(normalized)
      .resize(variant.width, variant.height, {
        fit: "cover",
        position: "centre",
      })
      .toFormat("webp", { quality: 82 })
      .toBuffer();

    const variantKey = `${prefix}/${variant.name}.webp`;
    await minioClient.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: variantKey,
        Body: variantBuffer,
        ContentType: "image/webp",
      }),
    );

    variants[variant.name as keyof PhotoVariants] = variantKey;
  }

  // Generate gallery variants (aspect-preserved, WebP)
  for (const variant of GALLERY_VARIANTS) {
    // Skip if original is smaller than this variant width
    if (originalWidth <= variant.width) continue;

    const variantBuffer = await sharp(normalized)
      .resize(variant.width, undefined, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat("webp", { quality: 85 })
      .toBuffer();

    const variantKey = `${prefix}/${variant.name}.webp`;
    await minioClient.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: variantKey,
        Body: variantBuffer,
        ContentType: "image/webp",
      }),
    );

    variants[variant.name as keyof PhotoVariants] = variantKey;
  }

  return {
    variants,
    originalWidth,
    originalHeight,
  };
}
