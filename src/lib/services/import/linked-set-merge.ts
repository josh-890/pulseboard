/**
 * When an import lands on a set the archive already holds.
 *
 * A folder developed from the archive produces a stub StagingSet — title,
 * channel, date parsed from the folder name — and a CONFIRMED archive link. If
 * the person import later delivers that same set, creating a second row would
 * split one real set into twins: one holding the link, the other holding the
 * import payload. So the import **runs into** the existing row instead
 * (ADR-0028).
 *
 * Two rules make that safe:
 *
 * **Fields are filled, never overwritten.** The collision key already pins
 * channel, exact date, type and normalised title, so everything else is either
 * empty on the stub or cosmetically different — overwriting would buy nothing and
 * risk clobbering something touched by hand.
 *
 * **The cast comes from the import**, because the import is the source for whom
 * the publisher credited. Whoever falls out of it is not lost: they survive as a
 * *claim* on the archive folder, which is where claims live. The one exception is
 * a cast member with no ICG-ID — an attribution needs one, so there is nowhere to
 * put them, and dropping them would destroy information the app cannot recover.
 * Those stay in the cast.
 */

import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'

export type CastMember = { name: string; icgId: string }

/**
 * Which fields of the stub the import may fill: only those the stub has not got.
 *
 * `null`, `undefined` and the empty string all count as "not got" — an import
 * that writes an empty description over a real one would be a silent loss, and an
 * empty string on the stub is an absence, not a decision.
 */
export function fieldsToFill<T extends object>(existing: Partial<T>, incoming: Partial<T>): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    const value = incoming[key]
    if (value === null || value === undefined || value === '') continue
    const held = existing[key]
    if (held === null || held === undefined || held === '') out[key] = value
  }
  return out
}

export type CastMerge = {
  /** What the set's cast becomes. */
  cast: CastMember[]
  /** People the import does not credit, to be written back as folder claims. */
  preservedAsClaims: CastMember[]
  /** Cast members with no ICG-ID: kept, because a claim cannot represent them. */
  keptWithoutIcgId: CastMember[]
}

export function mergeCast(existing: CastMember[], incoming: CastMember[]): CastMerge {
  const incomingIds = new Set(incoming.map((p) => p.icgId).filter(Boolean))
  const incomingNames = new Set(incoming.map((p) => p.name.trim().toLowerCase()))

  const preservedAsClaims: CastMember[] = []
  const keptWithoutIcgId: CastMember[] = []

  for (const person of existing) {
    if (person.icgId) {
      if (!incomingIds.has(person.icgId)) preservedAsClaims.push(person)
      continue
    }
    // No ICG-ID: nothing else in the system can hold this person, so the cast
    // has to. Skip the ones the import names anyway, or the same person would
    // appear twice under the same name.
    if (!incomingNames.has(person.name.trim().toLowerCase())) keptWithoutIcgId.push(person)
  }

  return { cast: [...incoming, ...keptWithoutIcgId], preservedAsClaims, keptWithoutIcgId }
}

/** A staging set the archive already holds, found by the collision key. */
export type LinkedCollision = { id: string; title: string; folderIds: string[] }

/**
 * A staging set with the same channel, exact date, type and normalised title that
 * is **already linked to an archive folder**.
 *
 * Same key `findProbableStagingDuplicate` uses, and the same one
 * `findExistingStagingSet` uses coming from the other direction — the archive and
 * the import have to agree on what "the same set" means, or one of them will keep
 * creating rows the other cannot see.
 *
 * Note the channel gate: an import whose channel the matcher could not resolve
 * has no `channelId`, and then no collision can be detected — the same blind spot
 * the existing duplicate detection has, and for the same reason. A set on an
 * unknown channel will still produce a twin.
 */
export async function findLinkedCollision(
  channelId: string | null,
  releaseDate: Date | null,
  isVideo: boolean,
  titleNorm: string,
): Promise<LinkedCollision | null> {
  if (!channelId || !releaseDate || !titleNorm) return null
  const hit = await prisma.stagingSet.findFirst({
    where: {
      channelId,
      releaseDate,
      isVideo,
      titleNorm,
      status: { not: 'SKIPPED' },
      archiveLinks: { some: { status: 'CONFIRMED' } },
    },
    select: {
      id: true,
      title: true,
      archiveLinks: { where: { status: 'CONFIRMED' }, select: { archiveFolderId: true } },
    },
  })
  if (!hit) return null
  return { id: hit.id, title: hit.title, folderIds: hit.archiveLinks.map((l) => l.archiveFolderId) }
}

export type MergeOutcome = {
  stagingSetId: string
  filledFields: string[]
  castSize: number
  claimsWritten: number
  keptWithoutIcgId: number
}

/**
 * Run an import set into the staging set the archive already holds.
 *
 * Everything curated is left alone: the archive link, the folder's claims, and
 * any field the stub already carries. What changes is what the stub could not
 * know — the publisher's own metadata and its cast.
 */
export async function mergeIntoLinkedStagingSet(
  collision: LinkedCollision,
  incomingFields: Record<string, unknown>,
  incomingCast: CastMember[],
  incomingStatuses: unknown[],
): Promise<MergeOutcome> {
  const existing = await prisma.stagingSet.findUniqueOrThrow({
    where: { id: collision.id },
    select: {
      id: true,
      externalId: true,
      description: true,
      coverImageUrl: true,
      imageCount: true,
      artist: true,
      artistNorm: true,
      channelId: true,
      releaseDate: true,
      importBatchId: true,
      importItemId: true,
      subjectPersonId: true,
      subjectIcgId: true,
      releaseDatePrecision: true,
      participants: true,
      participantStatuses: true,
    },
  })

  const held = Array.isArray(existing.participants)
    ? (existing.participants as { name?: string; icgId?: string }[]).map((p) => ({
        name: p.name ?? '',
        icgId: p.icgId ?? '',
      }))
    : []
  const merged = mergeCast(held, incomingCast)
  // UNKNOWN precision is an absence wearing an enum: the stub never knew, and the
  // import does. Everything else counts as held if it is non-empty.
  const forFill = {
    ...existing,
    releaseDatePrecision: existing.releaseDatePrecision === 'UNKNOWN' ? null : existing.releaseDatePrecision,
  }
  const fill = fieldsToFill(forFill as Record<string, unknown>, incomingFields)

  // Statuses travel with the cast: the import computed them for its own people,
  // and a kept-without-ICG-ID member keeps whatever the stub said about them.
  const heldStatuses = Array.isArray(existing.participantStatuses)
    ? (existing.participantStatuses as { name?: string; icgId?: string }[])
    : []
  const keptStatuses = merged.keptWithoutIcgId.map(
    (p) =>
      heldStatuses.find((s) => (s.name ?? '').trim().toLowerCase() === p.name.trim().toLowerCase()) ?? {
        name: p.name,
        icgId: '',
        status: 'new' as const,
      },
  )

  await prisma.stagingSet.update({
    where: { id: collision.id },
    data: {
      ...fill,
      participants: merged.cast,
      participantIcgIds: merged.cast.map((p) => p.icgId).filter(Boolean),
      participantNamesNorm: merged.cast.length
        ? merged.cast.map((p) => normalizeForSearch(p.name)).join(', ')
        : null,
      participantStatuses: [...incomingStatuses, ...keptStatuses] as never,
    },
  })

  // Whoever the import does not credit goes back to being a claim about the
  // folder — which is where the contradiction session will pick them up.
  let claimsWritten = 0
  for (const folderId of collision.folderIds) {
    for (const person of merged.preservedAsClaims) {
      const res = await prisma.archiveFolderAttribution.upsert({
        where: { archiveFolderId_icgId: { archiveFolderId: folderId, icgId: person.icgId } },
        create: { archiveFolderId: folderId, icgId: person.icgId, name: person.name },
        update: {},
        select: { id: true },
      })
      if (res) claimsWritten++
    }
  }

  return {
    stagingSetId: collision.id,
    filledFields: Object.keys(fill),
    castSize: merged.cast.length,
    claimsWritten,
    keptWithoutIcgId: merged.keptWithoutIcgId.length,
  }
}
