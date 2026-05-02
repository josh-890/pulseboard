import sharp from "sharp";
import { PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { minioClient, getMinioBucket } from "./minio";
import type { PhotoVariants } from "@/lib/types";

type ProfileVariant = {
  name: string;
  width: number;
  height: number;
};

type GalleryVariant = {
  name: string;
  maxSide: number;
  quality: number;
};

const PROFILE_VARIANTS: ProfileVariant[] = [
  { name: "profile_128", width: 128, height: 160 },
  { name: "profile_512", width: 512, height: 640 },
  { name: "profile_768", width: 768, height: 960 },
];

const GALLERY_VARIANTS: GalleryVariant[] = [
  { name: "gallery_512", maxSide: 512,  quality: 85 },
  { name: "view_1200",   maxSide: 1200, quality: 83 },
  { name: "full_2400",   maxSide: 2400, quality: 85 },
];

const MASTER_MAX_SIDE = 4000;
const MASTER_QUALITY = 88;


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
  const prefix = `${entityType}/${entityId}/${photoId}`;

  // Step 1 — Validate decodable via sharp metadata (magic bytes)
  console.log(`[storage] sharp: reading metadata…`);
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error("Image could not be decoded");
  }
  console.log(`[storage] sharp: ${originalWidth}×${originalHeight}, normalizing…`);

  // Step 2 — Normalize: auto-rotate EXIF, strip metadata, normalize colorspace
  const normalized = await sharp(buffer)
    .rotate()
    .withMetadata({ orientation: undefined })
    .toColorspace("srgb")
    .toBuffer();
  console.log(`[storage] sharp: normalized (${normalized.length} bytes)`);

  // Upload master_4000 (compressed WebP processing master — replaces raw original)
  const masterBuffer = await sharp(normalized)
    .resize({ width: MASTER_MAX_SIDE, height: MASTER_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: MASTER_QUALITY })
    .toBuffer();
  const keyMaster = `${prefix}/master_4000.webp`;
  console.log(`[storage] MinIO PUT: ${keyMaster} (${masterBuffer.length} bytes)`);
  await minioClient.send(
    new PutObjectCommand({
      Bucket: getMinioBucket(),
      Key: keyMaster,
      Body: masterBuffer,
      ContentType: "image/webp",
    }),
  );
  console.log(`[storage] MinIO PUT: master_4000 done`);

  const variants: PhotoVariants = { master_4000: keyMaster };

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
        Bucket: getMinioBucket(),
        Key: variantKey,
        Body: variantBuffer,
        ContentType: "image/webp",
      }),
    );

    variants[variant.name as keyof PhotoVariants] = variantKey;
  }

  // Generate gallery variants (aspect-preserved, longest-side, WebP)
  for (const variant of GALLERY_VARIANTS) {
    // Skip if original's longest side is already <= this variant's max side
    if (Math.max(originalWidth, originalHeight) <= variant.maxSide) continue;

    const variantBuffer = await sharp(normalized)
      .resize({ width: variant.maxSide, height: variant.maxSide, fit: "inside", withoutEnlargement: true })
      .toFormat("webp", { quality: variant.quality })
      .toBuffer();

    const variantKey = `${prefix}/${variant.name}.webp`;
    await minioClient.send(
      new PutObjectCommand({
        Bucket: getMinioBucket(),
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

// ─── Focal-aware cropping ────────────────────────────────────────────────────

type CropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Compute a crop rectangle centered on a focal point with the given target aspect ratio,
 * clamped to image bounds.
 */
export function computeFocalCropRegion(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  focalX: number,
  focalY: number,
): CropRegion {
  const targetAspect = targetWidth / targetHeight;
  const srcAspect = srcWidth / srcHeight;

  let cropW: number;
  let cropH: number;

  if (srcAspect > targetAspect) {
    // Source is wider — crop width
    cropH = srcHeight;
    cropW = Math.round(srcHeight * targetAspect);
  } else {
    // Source is taller — crop height
    cropW = srcWidth;
    cropH = Math.round(srcWidth / targetAspect);
  }

  // Center crop on focal point, clamped to bounds
  let left = Math.round(focalX * srcWidth - cropW / 2);
  let top = Math.round(focalY * srcHeight - cropH / 2);

  left = Math.max(0, Math.min(left, srcWidth - cropW));
  top = Math.max(0, Math.min(top, srcHeight - cropH));

  return { left, top, width: cropW, height: cropH };
}

/**
 * Regenerate profile variants for a MediaItem using focal-point-aware cropping.
 * Downloads original from MinIO, crops + resizes, re-uploads.
 * Returns updated variants JSON.
 */
export async function regenerateProfileVariants(
  variants: PhotoVariants,
  originalWidth: number,
  originalHeight: number,
  focalX: number,
  focalY: number,
): Promise<PhotoVariants> {
  const masterKey = variants.master_4000 ?? variants.original;
  if (!masterKey) return variants;

  // Download master from MinIO (master_4000 for new uploads, original for legacy)
  const getResult = await minioClient.send(
    new GetObjectCommand({
      Bucket: getMinioBucket(),
      Key: masterKey,
    }),
  );

  if (!getResult.Body) throw new Error("Empty response from MinIO");
  const bodyBytes = await getResult.Body.transformToByteArray();
  const buffer = Buffer.from(bodyBytes);

  // Normalize (same as upload)
  const normalized = await sharp(buffer)
    .rotate()
    .withMetadata({ orientation: undefined })
    .toColorspace("srgb")
    .toBuffer();

  const updated = { ...variants };

  for (const variant of PROFILE_VARIANTS) {
    if (originalWidth < variant.width && originalHeight < variant.height) continue;

    const region = computeFocalCropRegion(
      originalWidth,
      originalHeight,
      variant.width,
      variant.height,
      focalX,
      focalY,
    );

    const variantBuffer = await sharp(normalized)
      .extract(region)
      .resize(variant.width, variant.height)
      .toFormat("webp", { quality: 82 })
      .toBuffer();

    // Derive key from master key pattern: prefix/variant.webp
    const prefix = masterKey.substring(0, masterKey.lastIndexOf("/"));
    const variantKey = `${prefix}/${variant.name}.webp`;

    await minioClient.send(
      new PutObjectCommand({
        Bucket: getMinioBucket(),
        Key: variantKey,
        Body: variantBuffer,
        ContentType: "image/webp",
      }),
    );

    updated[variant.name as keyof PhotoVariants] = variantKey;
  }

  return updated;
}

// ─── Reference-session deep copy ─────────────────────────────────────────────

export async function copyMediaFilesToReference(
  sourceVariants: PhotoVariants,
  sourceFileRef: string | null,
  referenceSessionId: string,
): Promise<{ variants: PhotoVariants; fileRef: string | null }> {
  const bucket = getMinioBucket();
  const newId = crypto.randomUUID();
  const newPrefix = `sessions/${referenceSessionId}/${newId}`;
  const newVariants: PhotoVariants = {};

  for (const [variantName, sourceKey] of Object.entries(sourceVariants)) {
    if (!sourceKey || typeof sourceKey !== "string") continue;
    const ext = sourceKey.includes(".") ? sourceKey.substring(sourceKey.lastIndexOf(".")) : ".webp";
    const newKey = `${newPrefix}/${variantName}${ext}`;
    await minioClient.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${sourceKey}`,
        Key: newKey,
      }),
    );
    newVariants[variantName as keyof PhotoVariants] = newKey;
  }

  let newFileRef: string | null = null;
  if (sourceFileRef) {
    const ext = sourceFileRef.includes(".") ? sourceFileRef.substring(sourceFileRef.lastIndexOf(".")) : "";
    newFileRef = `${newPrefix}/original${ext}`;
    await minioClient.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${sourceFileRef}`,
        Key: newFileRef,
      }),
    );
  }

  return { variants: newVariants, fileRef: newFileRef };
}

// ─── MinIO file deletion ─────────────────────────────────────────────────────

/**
 * Delete all variant files from MinIO for a list of media items.
 * Best-effort: logs errors but does not throw (orphan files in storage are
 * acceptable; orphan DB rows are not).
 */
export async function deleteMediaFiles(variantsList: PhotoVariants[]): Promise<void> {
  const keys: string[] = [];
  for (const variants of variantsList) {
    for (const key of Object.values(variants)) {
      if (typeof key === "string" && key.length > 0) {
        keys.push(key);
      }
    }
  }

  if (keys.length === 0) return;

  // S3 DeleteObjects supports max 1000 keys per request
  const BATCH_SIZE = 1000;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    try {
      await minioClient.send(
        new DeleteObjectsCommand({
          Bucket: getMinioBucket(),
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    } catch (err) {
      console.error(`[deleteMediaFiles] Failed to delete batch starting at index ${i}:`, err);
    }
  }
}
