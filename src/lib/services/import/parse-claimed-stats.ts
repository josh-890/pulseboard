/**
 * Extract a person's claimed catalogue size from their imported biography.
 *
 * Import biographies commonly state the catalogue as a sentence like
 * "… has 70 covers, 50 photosets and 20 videos". We capture the photoset and
 * video counts only — "covers" is always derived (photosets + videos), so it is
 * never stored (see Person.claimedPhotosets / claimedVideos).
 *
 * Best-effort and tolerant: handles "photosets" / "photo sets" / "photo-sets",
 * singular/plural, and thousands separators. Returns null for any figure not
 * found rather than guessing. The first match for each metric wins.
 */

export type ParsedClaimedStats = {
  photosets: number | null
  videos: number | null
}

const PHOTOSETS_RE = /(\d[\d,]*)\s+photo[\s-]?sets?\b/i
const VIDEOS_RE = /(\d[\d,]*)\s+videos?\b/i

function toInt(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number.parseInt(raw.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

export function parseClaimedStats(text: string | null | undefined): ParsedClaimedStats {
  if (!text) return { photosets: null, videos: null }
  return {
    photosets: toInt(text.match(PHOTOSETS_RE)?.[1]),
    videos: toInt(text.match(VIDEOS_RE)?.[1]),
  }
}
