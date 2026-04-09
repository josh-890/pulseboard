export type PhotoVariants = {
  // ── Current variants (generated for new uploads) ──────────────────────────
  master_4000?: string; // processing master — replaces raw original (WebP q88, 4000px LS)
  gallery_512?: string; // thumbnail (WebP q85, 512px LS)
  view_1200?: string;   // medium display (WebP q83, 1200px LS)
  full_2400?: string;   // high-res display / lightbox (WebP q85, 2400px LS)
  profile_128?: string; // headshot slot (WebP q82, 128×160 cover crop)
  profile_512?: string; // profile carousel (WebP q82, 512×640 cover crop)
  profile_768?: string; // profile carousel large (WebP q82, 768×960 cover crop)
  // ── Legacy variants (still present on existing images, not generated for new ones) ──
  original?: string;    // raw upload — kept for backward compat; prefer master_4000
  gallery_1024?: string;
  gallery_1600?: string;
  profile_256?: string;
};

/**
 * Runtime guard for Prisma Json? → PhotoVariants conversion.
 * Returns a valid PhotoVariants or null if the shape is invalid.
 * Accepts either `original` (legacy) or `master_4000` (new uploads) as the anchor key.
 */
export function parsePhotoVariants(value: unknown): PhotoVariants | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.original !== "string" && typeof obj.master_4000 !== "string") return null;
  return obj as unknown as PhotoVariants;
}

export type PhotoUrls = {
  /** Best full-quality URL available: master_4000 for new uploads, original for legacy. */
  original: string;
  // ── Current variants ──────────────────────────────────────────────────────
  master_4000: string | null;
  gallery_512: string | null;
  view_1200: string | null;
  full_2400: string | null;
  profile_128: string | null;
  profile_512: string | null;
  profile_768: string | null;
  // ── Legacy variants (null for new images) ────────────────────────────────
  gallery_1024: string | null;
  gallery_1600: string | null;
  profile_256: string | null;
};
