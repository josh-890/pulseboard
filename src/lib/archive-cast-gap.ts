/**
 * Who the archive names for a set that the set itself does not credit.
 *
 * Pure, and outside the service layer for the same reason as
 * `attribution-candidates.ts`: the staged-sets browser is a client component, and
 * importing a Prisma-touching service into it drags `node:async_hooks` into the
 * browser bundle — only the build catches that.
 *
 * **What counts as "the archive says so"**: your confirmed claims
 * (`ArchiveFolderAttribution`) and your hand markers (`ArchiveFolderSuggestion`
 * with source `FOLDER_ATTRIBUTION`). Both are your own statement, written with the
 * cover in front of you; a marker is unconfirmed only because a mistyped ICG-ID
 * usually points at a *real other person*, not because it is in doubt.
 *
 * **What does not count**: catalogue suggestions. Those are machine guesses —
 * 5,074 of them on xpulse — and folding them in would light up half the browser
 * with proposals nobody has vouched for.
 *
 * The two lists are compared, never merged (ADR-0028): a name the cast does not
 * carry is a disagreement to decide, not a duplicate to fold away.
 */

export type ArchivePerson = {
  icgId: string
  name: string
  /** True once you confirmed it; false while it is still a file on disk. */
  confirmed: boolean
}

/**
 * How a proposed match sits with what you already established about the folder.
 *
 *   `unknown` — you have said nothing about this folder, so there is nothing to
 *               agree with. Silent: 2,742 of 2,841 live proposals are in this
 *               state, and a badge on all of them would be wallpaper.
 *   `agrees`  — the set credits everyone you recorded. Corroboration the banner
 *               could not show before: it compared date and title only.
 *   `missing` — the set does not credit somebody you recorded. Worth doubting
 *               *before* confirming, rather than finding it in the gap list
 *               afterwards.
 */
export function castVerdict(
  own: ArchivePerson[],
  castIcgIds: string[],
): { verdict: 'unknown' | 'agrees' | 'missing'; missing: ArchivePerson[] } {
  if (own.length === 0) return { verdict: 'unknown', missing: [] }
  const missing = archivePeopleMissingFromCast(own, castIcgIds.map((icgId) => ({ icgId })))
  return { verdict: missing.length === 0 ? 'agrees' : 'missing', missing }
}

/**
 * The archive's people that the cast does not name.
 *
 * A person claimed *and* marked appears once, as confirmed — the stronger of the
 * two statements. Order follows the input, so the display is stable between loads.
 */
export function archivePeopleMissingFromCast(
  archivePeople: ArchivePerson[],
  cast: { icgId: string }[],
): ArchivePerson[] {
  const credited = new Set(cast.map((c) => c.icgId))
  const out = new Map<string, ArchivePerson>()
  for (const p of archivePeople) {
    if (!p.icgId || credited.has(p.icgId)) continue
    const seen = out.get(p.icgId)
    if (!seen) out.set(p.icgId, p)
    else if (p.confirmed && !seen.confirmed) out.set(p.icgId, p)
  }
  return [...out.values()]
}
