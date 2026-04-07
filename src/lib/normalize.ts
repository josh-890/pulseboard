/**
 * Shared normalization for all `*Norm` database fields.
 * NFD decomposition + diacritics strip + lowercase + trim.
 *
 * Used by every service that writes nameNorm / titleNorm / artistNorm fields.
 */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}
