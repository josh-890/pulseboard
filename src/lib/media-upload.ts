import sharp from "sharp";
import { PutObjectCommand, GetObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { minioClient, getMinioBucket } from "./minio";

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

  // Upload original (native format)
  const keyOriginal = `${prefix}/original.${ext}`;
  console.log(`[storage] MinIO PUT: ${keyOriginal}`);
  await minioClient.send(
    new PutObjectCommand({
      Bucket: getMinioBucket(),
      Key: keyOriginal,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
  console.log(`[storage] MinIO PUT: original done`);

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
        Bucket: getMinioBucket(),
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
  const originalKey = variants.original;
  if (!originalKey) return variants;

  // Download original from MinIO
  const getResult = await minioClient.send(
    new GetObjectCommand({
      Bucket: getMinioBucket(),
      Key: originalKey,
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

    // Derive key from original key pattern: prefix/variant.webp
    const prefix = originalKey.substring(0, originalKey.lastIndexOf("/"));
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
