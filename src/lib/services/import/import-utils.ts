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
