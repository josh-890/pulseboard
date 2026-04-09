import type { PhotoVariants, PhotoUrls } from "@/lib/types";
import { getCurrentTenantConfig } from "./tenant-context";
import { isSingleTenantMode } from "./tenants";

/**
 * Get the MinIO base URL for the current tenant.
 * Format: http://host:port/bucket
 */
function getBaseUrl(): string {
  if (isSingleTenantMode()) {
    return process.env.NEXT_PUBLIC_MINIO_URL!;
  }
  const minioBase = process.env.MINIO_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_MINIO_URL!;
  // Strip any trailing bucket from the base URL (e.g., "http://host:port/pulseboard" → "http://host:port")
  const url = new URL(minioBase);
  const bucket = getCurrentTenantConfig().minioBucket;
  return `${url.origin}/${bucket}`;
}

/** Build a full MinIO URL from a storage key. */
export function buildUrl(key: string): string {
  return `${getBaseUrl()}/${key}`;
}

/** Build a full set of photo URLs from variants and optional fileRef fallback. */
export function buildPhotoUrls(variants: PhotoVariants, fileRef?: string | null): PhotoUrls {
  // urls.original = best full-quality source (master_4000 for new uploads, original for legacy)
  const bestMaster = variants.master_4000 ?? variants.original;
  const originalUrl = bestMaster
    ? buildUrl(bestMaster)
    : fileRef
      ? buildUrl(fileRef)
      : "";
  return {
    original: originalUrl,
    master_4000: variants.master_4000 ? buildUrl(variants.master_4000) : null,
    profile_128: variants.profile_128 ? buildUrl(variants.profile_128) : null,
    profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
    profile_512: variants.profile_512 ? buildUrl(variants.profile_512) : null,
    profile_768: variants.profile_768 ? buildUrl(variants.profile_768) : null,
    gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
    view_1200: variants.view_1200 ? buildUrl(variants.view_1200) : null,
    full_2400: variants.full_2400 ? buildUrl(variants.full_2400) : null,
    gallery_1024: variants.gallery_1024 ? buildUrl(variants.gallery_1024) : null,
    gallery_1600: variants.gallery_1600 ? buildUrl(variants.gallery_1600) : null,
  };
}
