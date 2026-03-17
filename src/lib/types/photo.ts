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

/**
 * Runtime guard for Prisma Json? → PhotoVariants conversion.
 * Returns a valid PhotoVariants or null if the shape is invalid.
 */
export function parsePhotoVariants(value: unknown): PhotoVariants | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.original !== "string") return null;
  return obj as unknown as PhotoVariants;
}

export type PhotoUrls = {
  original: string;
  profile_128: string | null;
  profile_256: string | null;
  profile_512: string | null;
  profile_768: string | null;
  gallery_512: string | null;
  gallery_1024: string | null;
  gallery_1600: string | null;
};
