// ─── Breast description parsing ─────────────────────────────────────────────

// Reverse map: textual description → cup letter (best guess, lower bound)
export const BREAST_TEXT_TO_CUP: Record<string, string> = {
  'very small': 'A',
  'tiny': 'A',
  'small': 'B',
  'medium': 'C',
  'medium-large': 'D',
  'medium–large': 'D',
  'large': 'DD',
  'very large': 'F',
  'extra large': 'G',
}

/**
 * Parse breast description like "Large (Real)" or "Medium-Large (Fake)"
 * Returns { cupSize, status, raw }
 */
export function parseBreastDescription(raw: string): {
  cupSize: string | null
  status: 'natural' | 'enhanced'
  raw: string
} {
  const rawTrimmed = raw.trim()
  // Extract status from parenthetical: (Real) or (Fake/Enhanced)
  const statusMatch = rawTrimmed.match(/\((real|natural|fake|enhanced|implants?|augmented)\)/i)
  const statusText = statusMatch?.[1]?.toLowerCase() ?? ''
  const status: 'natural' | 'enhanced' =
    statusText === 'fake' || statusText === 'enhanced' || statusText === 'implants' ||
    statusText === 'implant' || statusText === 'augmented'
      ? 'enhanced'
      : 'natural'

  // Extract size text (everything before the parenthetical)
  const sizeText = rawTrimmed.replace(/\s*\(.*?\)\s*/, '').trim().toLowerCase()
  const cupSize = BREAST_TEXT_TO_CUP[sizeText] ?? null

  return { cupSize, status, raw: rawTrimmed }
}

/**
 * Try to extract cup size from measurements string like "86C-66-87"
 * Returns cup letter or null.
 */
export function extractCupFromMeasurements(measurements: string): string | null {
  // Match bust measurement with cup letter: e.g. "86C" or "34D"
  const match = measurements.match(/\d{2,3}([A-H]{1,2})/i)
  return match ? match[1].toUpperCase() : null
}

/**
 * ADR-0008 principle 4: when the source signals an enhanced status, the cup
 * we extracted from measurements / breast description reflects the post-
 * enhancement state and is not a natural baseline value. Returning null tells
 * the import not to write a baseline breast-size delta — the gap stays
 * searchable as "natural breast size unknown" for manual curation.
 */
export function chooseNaturalCup(
  cupAny: string | null,
  parsedStatus: 'natural' | 'enhanced' | null,
): string | null {
  return parsedStatus === 'enhanced' ? null : cupAny
}

// Map a raw cup letter ("B", "DD") to the canonical anchored
// breast_size allowedValue ("B (small to medium)", "DD (very full)").
// Migration `20260601010000_anchor_breast_size` made the anchored form the
// canonical stored value; the parser still emits short letters from import
// text, so this helper bridges parser output to catalog convention.
//
// Unknown / out-of-vocab cups (e.g. "G", "DD/E") fall through unchanged so
// pre-existing data anomalies stay observable rather than getting silently
// rewritten into a wrong canonical form.
const BREAST_CUP_TO_CANONICAL: Record<string, string> = {
  'AA': 'AA (very small / nearly flat)',
  'A':  'A (small)',
  'B':  'B (small to medium)',
  'C':  'C (medium)',
  'D':  'D (full)',
  'DD': 'DD (very full)',
  'E':  'E (extra full)',
  'F':  'F (very large)',
}

export function canonicaliseBreastCup(cup: string | null): string | null {
  if (cup == null) return null
  return BREAST_CUP_TO_CANONICAL[cup] ?? cup
}
