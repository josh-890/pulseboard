import type { PhotoVariants, PhotoUrls } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

/** Build a full MinIO URL from a storage key. */
export function buildUrl(key: string): string {
  return `${BASE_URL}/${key}`;
}

/** Build a full set of photo URLs from variants and optional fileRef fallback. */
export function buildPhotoUrls(variants: PhotoVariants, fileRef?: string | null): PhotoUrls {
  const originalUrl = variants.original
    ? buildUrl(variants.original)
    : fileRef
      ? buildUrl(fileRef)
      : "";
  return {
    original: originalUrl,
    profile_128: variants.profile_128 ? buildUrl(variants.profile_128) : null,
    profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
    profile_512: variants.profile_512 ? buildUrl(variants.profile_512) : null,
    profile_768: variants.profile_768 ? buildUrl(variants.profile_768) : null,
    gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
    gallery_1024: variants.gallery_1024 ? buildUrl(variants.gallery_1024) : null,
    gallery_1600: variants.gallery_1600 ? buildUrl(variants.gallery_1600) : null,
  };
}
