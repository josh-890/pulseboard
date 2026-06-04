/**
 * StagingSet service — CRUD, querying, comparison, and promotion.
 *
 * StagingSets persist import data across batches, enabling
 * cross-person set discovery, channel timeline views, and
 * progressive enrichment of existing Sets.
 */

import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import { ArchiveLinkStatus } from '@/generated/prisma/client'
import type { ChannelTier, DatePrecision, Prisma, StagingSet, StagingSetStatus } from '@/generated/prisma/client'
import type { StagingWorkHistoryItem } from '@/lib/types'
import { onSetPromoted } from '@/lib/services/coherence-service'
import type { SuggestedFolderInfo } from '@/lib/services/archive-service'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CoherenceSnapshotMini = {
  hasMediaInApp: boolean
} | null

type ArchiveLinkMini = {
  id: string
  status: string
  archivePath: string | null
  archiveStatus: string
  archiveFileCount: number | null
  archiveFileCountPrev: number | null
  archiveLastChecked: Date | null
  archiveVideoPresent: boolean | null
  archiveFolder: { id: string; folderName: string; fullPath: string; scannedAt: Date } | null
}

export type PromotedSetArchiveMini = {
  id: string
  archiveLinks: ArchiveLinkMini[]
} | null

export type StagingSetWithRelations = StagingSet & {
  channel: { id: string; name: string; tier: ChannelTier; shortName: string | null; channelFolder: string | null } | null
  matchedSet: { id: string; title: string; channelId: string | null } | null
  coherenceSnapshot: CoherenceSnapshotMini
  archiveLinks: ArchiveLinkMini[]
  promotedSet: PromotedSetArchiveMini
  /** Present when this is the VIDEO half of a split set — points to the photo anchor */
  sibling: { id: string; isVideo: boolean } | null
  /** Present when this is the PHOTO anchor — pointed to by a video sibling */
  siblingOf: { id: string; isVideo: boolean } | null
  /** Populated server-side after main query via getSuggestedFoldersForStagingSets */
  suggestedArchiveFolder?: SuggestedFolderInfo | null
  /** True when a matching folder exists but is CONFIRMED to a different entity — indicates a mis-assigned link */
  hasLinkConflict?: boolean
}

export type ParticipantStatus = {
  name: string
  icgId: string
  status: 'known' | 'candidate' | 'new'
  personId?: string
  thumbnailUrl?: string
}

type ParticipantInfo = {
  personId: string
  name: string
  role: string
}

type CreditInfo = {
  rawName: string
  resolvedPersonId: string | null
}

export type StagingSetComparison = {
  stagingSet: StagingSetWithRelations
  matchedSet: {
    id: string
    title: string
    type: string
    channel: { id: string; name: string } | null
    releaseDate: Date | null
    releaseDatePrecision: string
    imageCount: number | null
    description: string | null
    externalId: string | null
    participants: ParticipantInfo[]
    credits: CreditInfo[]
  } | null
  diff: {
    newParticipants: Array<{ name: string; icgId: string }>
    newCredits: string[]
    fieldUpdates: Array<{ field: string; existing: unknown; imported: unknown }>
  }
}

// ─── Queries ────────────────────────────────────────────────────────────────

const ARCHIVE_LINK_SELECT = {
  id: true,
  status: true,
  archivePath: true,
  archiveStatus: true,
  archiveFileCount: true,
  archiveFileCountPrev: true,
  archiveLastChecked: true,
  archiveVideoPresent: true,
  archiveFolder: { select: { id: true, folderName: true, fullPath: true, scannedAt: true } },
} as const

const STAGING_SET_INCLUDE = {
  channel: { select: { id: true, name: true, tier: true, shortName: true, channelFolder: true } },
  matchedSet: { select: { id: true, title: true, channelId: true } },
  coherenceSnapshot: {
    select: { hasMediaInApp: true },
  },
  archiveLinks: {
    select: ARCHIVE_LINK_SELECT,
  },
  promotedSet: {
    select: {
      id: true,
      archiveLinks: { select: ARCHIVE_LINK_SELECT },
    },
  },
  // Split-set sibling: video set points to photo anchor via siblingId
  sibling: { select: { id: true, isVideo: true } },
  siblingOf: { select: { id: true, isVideo: true } },
} as const

export async function getStagingSetsForBatch(batchId: string): Promise<StagingSetWithRelations[]> {
  return prisma.stagingSet.findMany({
    where: { importBatchId: batchId },
    include: STAGING_SET_INCLUDE,
    orderBy: [{ releaseDate: 'asc' }, { title: 'asc' }],
  })
}

export async function getStagingSetById(id: string): Promise<StagingSetWithRelations | null> {
  return prisma.stagingSet.findUnique({
    where: { id },
    include: STAGING_SET_INCLUDE,
  })
}

export async function getStagingWorkHistoryForPerson(personId: string): Promise<StagingWorkHistoryItem[]> {
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { icgId: true },
  })
  if (!person) return []

  const stagingSets = await prisma.stagingSet.findMany({
    where: {
      participantIcgIds: { has: person.icgId },
      status: 'APPROVED',
    },
    select: {
      id: true,
      title: true,
      channelName: true,
      channelId: true,
      releaseDate: true,
      releaseDatePrecision: true,
      isVideo: true,
      externalId: true,
      coverImageUrl: true,
      // Pull label info via the channel's labelMaps so the staging
      // contribution counts toward the same per-label affiliation that
      // promoted sets do (deriveAffiliations consumes both arrays).
      channel: {
        select: {
          labelMaps: {
            take: 1,
            select: { label: { select: { id: true, name: true } } },
          },
        },
      },
      archiveLinks: {
        select: { archiveStatus: true, status: true, archiveFileCount: true },
      },
    },
    orderBy: [{ releaseDate: 'desc' }, { title: 'asc' }],
  })

  return stagingSets.map((s) => {
    const labelRow = s.channel?.labelMaps[0]?.label ?? null
    const confirmed = s.archiveLinks.find((l) => l.status === 'CONFIRMED')
    const hasSuggestion = !confirmed && s.archiveLinks.some((l) => l.status === 'SUGGESTED')
    return {
      stagingSetId: s.id,
      title: s.title,
      channelName: s.channelName,
      channelId: s.channelId,
      releaseDate: s.releaseDate,
      releaseDatePrecision: s.releaseDatePrecision,
      isVideo: s.isVideo,
      externalId: s.externalId,
      coverImageUrl: s.coverImageUrl,
      labelId: labelRow?.id ?? null,
      labelName: labelRow?.name ?? null,
      archiveStatus: confirmed?.archiveStatus ?? null,
      archiveFileCount: confirmed?.archiveFileCount ?? null,
      hasSuggestion,
    }
  })
}

export async function getStagingSetsForPerson(
  personIdOrIcgId: string,
): Promise<StagingSetWithRelations[]> {
  return prisma.stagingSet.findMany({
    where: {
      OR: [
        { subjectPersonId: personIdOrIcgId },
        { subjectIcgId: personIdOrIcgId },
        { participantIcgIds: { has: personIdOrIcgId } },
      ],
    },
    include: STAGING_SET_INCLUDE,
    orderBy: [{ releaseDate: 'asc' }, { title: 'asc' }],
  })
}

export async function getStagingSetsForChannel(
  channelIdOrName: string,
): Promise<StagingSetWithRelations[]> {
  return prisma.stagingSet.findMany({
    where: {
      OR: [
        { channelId: channelIdOrName },
        { channelName: { equals: channelIdOrName, mode: 'insensitive' } },
      ],
    },
    include: STAGING_SET_INCLUDE,
    orderBy: [{ releaseDate: 'asc' }, { title: 'asc' }],
  })
}

export async function getStagingSetDuplicateGroup(
  groupId: string,
): Promise<StagingSetWithRelations[]> {
  return prisma.stagingSet.findMany({
    where: { duplicateGroupId: groupId },
    include: STAGING_SET_INCLUDE,
    orderBy: [{ createdAt: 'asc' }],
  })
}

// ─── Comparison ─────────────────────────────────────────────────────────────

export async function getStagingSetComparison(
  stagingSetId: string,
): Promise<StagingSetComparison | null> {
  const stagingSet = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    include: STAGING_SET_INCLUDE,
  })
  if (!stagingSet) return null

  let matchedSetData: StagingSetComparison['matchedSet'] = null
  const diff: StagingSetComparison['diff'] = {
    newParticipants: [],
    newCredits: [],
    fieldUpdates: [],
  }

  if (stagingSet.matchedSetId) {
    const existingSet = await prisma.set.findUnique({
      where: { id: stagingSet.matchedSetId },
      include: {
        channel: { select: { id: true, name: true, tier: true, shortName: true, channelFolder: true } },
        sessionLinks: {
          where: { isPrimary: true },
          select: {
            session: {
              select: {
                contributions: {
                  select: {
                    person: {
                      select: {
                        id: true,
                        aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
                      },
                    },
                    roleDefinition: { select: { name: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
        creditsRaw: {
          select: { rawName: true, resolvedPersonId: true },
        },
      },
    })

    if (existingSet) {
      const primarySession = existingSet.sessionLinks[0]?.session
      const existingParticipants: ParticipantInfo[] = (primarySession?.contributions ?? []).map((c) => ({
        personId: c.person.id,
        name: c.person.aliases[0]?.name ?? 'Unknown',
        role: c.roleDefinition.name,
      }))

      matchedSetData = {
        id: existingSet.id,
        title: existingSet.title,
        type: existingSet.type,
        channel: existingSet.channel,
        releaseDate: existingSet.releaseDate,
        releaseDatePrecision: existingSet.releaseDatePrecision,
        imageCount: existingSet.imageCount,
        description: existingSet.description,
        externalId: existingSet.externalId,
        participants: existingParticipants,
        credits: existingSet.creditsRaw.map((c) => ({
          rawName: c.rawName,
          resolvedPersonId: c.resolvedPersonId,
        })),
      }

      // Compute diff: new participants
      const existingPersonIds = new Set(existingParticipants.map((p) => p.personId))
      const importParticipants = (stagingSet.participants as Array<{ name: string; icgId: string }>) ?? []

      for (const p of importParticipants) {
        // Check if this person is already a participant (by icgId → personId lookup)
        const person = await prisma.person.findUnique({
          where: { icgId: p.icgId },
          select: { id: true },
        })
        if (!person || !existingPersonIds.has(person.id)) {
          diff.newParticipants.push({ name: p.name, icgId: p.icgId })
        }
      }

      // Compute diff: new credits
      const existingCreditNorms = new Set(existingSet.creditsRaw.map((c) => c.rawName.toLowerCase()))
      if (stagingSet.artist && !existingCreditNorms.has(stagingSet.artist.toLowerCase())) {
        diff.newCredits.push(stagingSet.artist)
      }

      // Compute diff: field updates (non-null import value where existing is null)
      const fieldChecks: Array<{ field: string; existing: unknown; imported: unknown }> = [
        { field: 'description', existing: existingSet.description, imported: stagingSet.description },
        { field: 'imageCount', existing: existingSet.imageCount, imported: stagingSet.imageCount },
        { field: 'externalId', existing: existingSet.externalId, imported: stagingSet.externalId },
      ]
      for (const check of fieldChecks) {
        if (check.existing == null && check.imported != null) {
          diff.fieldUpdates.push(check)
        }
      }
    }
  }

  return { stagingSet, matchedSet: matchedSetData, diff }
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function updateStagingSetStatus(
  id: string,
  status: StagingSetStatus,
  notes?: string,
): Promise<StagingSet> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.stagingSet.update({
      where: { id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
    })
    // When skipping a set, clear any pending SUGGESTED ArchiveLink so the
    // matching pass can re-assign the suggestion to a surviving duplicate.
    if (status === 'SKIPPED') {
      await tx.archiveLink.deleteMany({
        where: { stagingSetId: id, status: ArchiveLinkStatus.SUGGESTED },
      })
    }
    return updated
  })
}

// The candidate set(s) that triggered THIS set's duplicate warning — the
// "suggested duplicate". NOT to be confused with a split sibling
// (StagingSet.siblingId: the photo/video counterpart of one import set).
export type DuplicateCandidate = {
  id: string
  title: string
  channelName: string | null
  releaseDate: Date | null
  isVideo: boolean
  externalId: string | null
  status: StagingSetStatus
  coverImageUrl: string | null
  participantNames: string[]
  kind: 'confirmed' | 'probable'
}

function _participantDisplayNames(participants: unknown): string[] {
  if (!Array.isArray(participants)) return []
  return participants
    .map((p) =>
      p && typeof p === 'object' && 'name' in p ? String((p as { name?: unknown }).name ?? '').trim() : '',
    )
    .filter(Boolean)
}

/**
 * The staging set(s) that triggered this set's duplicate warning, so the user can
 * verify rather than guess. Confirmed: same duplicateGroupId. Probable: same
 * channel + release date AND flagged isDuplicate — mirroring
 * resolveStagingSetDuplicate, which also excludes the split photo/video sibling
 * (it shares the same externalId and is therefore never flagged isDuplicate).
 * Both exclude self and SKIPPED. Returns [] when the set carries no duplicate flag.
 */
export async function getDuplicateCandidates(id: string): Promise<DuplicateCandidate[]> {
  const self = await prisma.stagingSet.findUnique({
    where: { id },
    select: { duplicateGroupId: true, channelId: true, releaseDate: true },
  })
  if (!self) return []

  const select = {
    id: true,
    title: true,
    channelName: true,
    releaseDate: true,
    isVideo: true,
    externalId: true,
    status: true,
    coverImageUrl: true,
    participants: true,
  } as const

  let rows: Array<{
    id: string
    title: string
    channelName: string | null
    releaseDate: Date | null
    isVideo: boolean
    externalId: string | null
    status: StagingSetStatus
    coverImageUrl: string | null
    participants: unknown
  }>
  let kind: 'confirmed' | 'probable'

  if (self.duplicateGroupId) {
    kind = 'confirmed'
    rows = await prisma.stagingSet.findMany({
      where: { duplicateGroupId: self.duplicateGroupId, id: { not: id }, status: { not: 'SKIPPED' } },
      select,
      orderBy: { releaseDate: 'asc' },
    })
  } else if (self.channelId && self.releaseDate) {
    kind = 'probable'
    rows = await prisma.stagingSet.findMany({
      where: {
        channelId: self.channelId,
        releaseDate: self.releaseDate,
        isDuplicate: true,
        id: { not: id },
        status: { not: 'SKIPPED' },
      },
      select,
      orderBy: { title: 'asc' },
    })
  } else {
    return []
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    channelName: r.channelName,
    releaseDate: r.releaseDate,
    isVideo: r.isVideo,
    externalId: r.externalId,
    status: r.status,
    coverImageUrl: r.coverImageUrl,
    participantNames: _participantDisplayNames(r.participants),
    kind,
  }))
}

export async function linkStagingSetDuplicate(
  id: string,
  duplicateGroupId: string,
): Promise<StagingSet> {
  return prisma.stagingSet.update({
    where: { id },
    data: {
      duplicateGroupId,
      isDuplicate: true,
      status: 'INACTIVE',
    },
  })
}

/**
 * Resolve a duplicate entry: skip it and clean up the group.
 * - Marks this entry SKIPPED + clears its duplicateGroupId
 * - If only one non-skipped sibling remains in the group, clears its duplicateGroupId too
 *   (it is now the unique surviving entry — no badge needed)
 */
export async function resolveStagingSetDuplicate(id: string): Promise<StagingSet> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.stagingSet.findUniqueOrThrow({
      where: { id },
      select: { duplicateGroupId: true, channelId: true, releaseDate: true },
    })
    const groupId = entry.duplicateGroupId

    const updated = await tx.stagingSet.update({
      where: { id },
      data: { status: 'SKIPPED', duplicateGroupId: null, isDuplicate: false },
    })

    // Clear any SUGGESTED ArchiveLink so the matching pass can re-assign it
    // to the surviving duplicate set on the next scan.
    await tx.archiveLink.deleteMany({
      where: { stagingSetId: id, status: ArchiveLinkStatus.SUGGESTED },
    })

    if (groupId) {
      // Confirmed duplicate group: clear groupId from sole survivor
      const remaining = await tx.stagingSet.findMany({
        where: { duplicateGroupId: groupId, status: { not: 'SKIPPED' } },
        select: { id: true },
      })
      if (remaining.length === 1) {
        await tx.stagingSet.update({
          where: { id: remaining[0].id },
          data: { duplicateGroupId: null, isDuplicate: false },
        })
      }
    } else if (entry.channelId && entry.releaseDate) {
      // Probable duplicate (no groupId): find counterparts by channel+date.
      // If exactly 1 active counterpart remains it is now unique — clear its flag.
      // If 2+ remain they are still mutual duplicates — leave their flags intact.
      const remaining = await tx.stagingSet.findMany({
        where: {
          channelId: entry.channelId,
          releaseDate: entry.releaseDate,
          isDuplicate: true,
          id: { not: id },
          status: { not: 'SKIPPED' },
        },
        select: { id: true },
      })
      if (remaining.length === 1) {
        await tx.stagingSet.update({
          where: { id: remaining[0].id },
          data: { isDuplicate: false },
        })
      }
    }

    return updated
  })
}

export async function markStagingSetPromoted(
  id: string,
  promotedSetId: string,
): Promise<StagingSet> {
  const stagingSet = await prisma.stagingSet.update({
    where: { id },
    data: { status: 'PROMOTED', promotedSetId, mediaQueueAt: null, mediaPriority: null },
  })

  // Transfer any ArchiveLinks from this staging set to the promoted Set,
  // but only if the target set does not already have a CONFIRMED archive link.
  const existingConfirmedLink = await prisma.archiveLink.findFirst({
    where: { setId: promotedSetId, status: 'CONFIRMED' },
    select: { id: true },
  })
  if (!existingConfirmedLink) {
    await prisma.archiveLink.updateMany({
      where: { stagingSetId: id },
      data: { setId: promotedSetId, stagingSetId: null },
    })
  }

  void onSetPromoted(id, promotedSetId)
  return stagingSet
}

export async function resolveStagingSetChannel(
  id: string,
  channelId: string,
): Promise<StagingSet> {
  return prisma.stagingSet.update({
    where: { id },
    data: { channelId },
  })
}

// ─── Filtered Query ────────────────────────────────────────────────────────

export type StagingSetFilters = {
  status?: StagingSetStatus[]
  hasMatch?: boolean
  matchType?: 'exact' | 'probable'
  showDuplicates?: boolean
  isVideo?: boolean
  noDate?: boolean
  hasDateSuggestion?: boolean
  personId?: string
  channelId?: string
  channelTier?: ChannelTier[]
  dateFrom?: string
  dateTo?: string
  batchId?: string
  priority?: number[]
  archiveFilter?: 'hasPath' | 'ok' | 'changed' | 'missing' | 'inQueue' | 'needsMedia'
  readyForPromotion?: boolean
  noCover?: boolean
  search?: string
  sort?: 'date' | 'title' | 'priority' | 'importDate' | 'undatedFirst'
  sortDir?: 'asc' | 'desc'
  cursor?: string
  offset?: number
  limit?: number
}

export async function getStagingSetsFiltered(filters: StagingSetFilters): Promise<{
  items: StagingSetWithRelations[]
  total: number
  nextCursor: string | null
}> {
  const where: Prisma.StagingSetWhereInput = {}
  const conditions: Prisma.StagingSetWhereInput[] = []

  if (filters.status?.length) {
    conditions.push({ status: { in: filters.status } })
  }

  if (filters.hasMatch === true) {
    conditions.push({ matchedSetId: { not: null } })
  } else if (filters.hasMatch === false) {
    conditions.push({ matchedSetId: null })
  }

  if (filters.matchType === 'exact') {
    conditions.push({ matchedSetId: { not: null }, matchConfidence: 1.0 })
  } else if (filters.matchType === 'probable') {
    conditions.push({ matchedSetId: { not: null }, matchConfidence: { lt: 1.0 } })
  }

  if (filters.showDuplicates) {
    conditions.push({
      OR: [
        { isDuplicate: true },
        { duplicateGroupId: { not: null } },
      ],
    })
  }

  if (filters.personId) {
    const personForFilter = await prisma.person.findUnique({
      where: { id: filters.personId },
      select: { icgId: true },
    })
    const icgId = personForFilter?.icgId
    conditions.push({
      OR: [
        { subjectPersonId: filters.personId },
        { subjectIcgId: filters.personId },
        ...(icgId ? [{ participantIcgIds: { has: icgId } }] : []),
        { participantIcgIds: { has: filters.personId } }, // fallback: filter value is already an ICG ID
      ],
    })
  }

  if (filters.channelId) {
    conditions.push({
      OR: [
        { channelId: filters.channelId },
        { channelName: { equals: filters.channelId, mode: 'insensitive' } },
      ],
    })
  }

  if (filters.channelTier?.length) {
    conditions.push({
      OR: [
        { channel: { tier: { in: filters.channelTier } } },
        { channelId: null }, // always show unresolved staging sets
      ],
    })
  }

  if (filters.dateFrom) {
    conditions.push({ releaseDate: { gte: new Date(filters.dateFrom) } })
  }

  if (filters.dateTo) {
    conditions.push({ releaseDate: { lte: new Date(filters.dateTo) } })
  }

  if (filters.batchId) {
    conditions.push({ importBatchId: filters.batchId })
  }

  if (filters.priority?.length) {
    conditions.push({ priority: { in: filters.priority } })
  }

  if (filters.archiveFilter) {
    const confirmed = ArchiveLinkStatus.CONFIRMED
    switch (filters.archiveFilter) {
      case 'hasPath':
        conditions.push({ archiveLinks: { some: { status: confirmed, archivePath: { not: null } } } })
        break
      case 'ok':
        conditions.push({ archiveLinks: { some: { status: confirmed, archiveStatus: 'OK' } } })
        break
      case 'changed':
        conditions.push({ archiveLinks: { some: { status: confirmed, archiveStatus: 'CHANGED' } } })
        break
      case 'missing':
        conditions.push({ archiveLinks: { some: { status: confirmed, archiveStatus: 'MISSING' } } })
        break
      case 'inQueue':
        conditions.push({ mediaQueueAt: { not: null } })
        break
      case 'needsMedia':
        conditions.push({ archiveLinks: { none: { status: confirmed } }, mediaQueueAt: null })
        break
    }
  }

  if (filters.readyForPromotion) {
    const confirmed = ArchiveLinkStatus.CONFIRMED
    conditions.push({ status: 'APPROVED' })
    conditions.push({ archiveLinks: { some: { status: confirmed, archivePath: { not: null } } } })
    // All participants must be 'known' (or no participants listed)
    const knownRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "staging_set"
      WHERE "participantStatuses" IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements("participantStatuses"::jsonb) AS ps
           WHERE ps->>'status' != 'known'
         )
    `
    conditions.push({ id: { in: knownRows.map((r) => r.id) } })
  }

  if (filters.isVideo !== undefined) {
    conditions.push({ isVideo: filters.isVideo })
  }

  if (filters.noCover) {
    // "No local cover" = null OR an external/imported URL (local covers always contain '/staging/')
    conditions.push({ OR: [{ coverImageUrl: null }, { coverImageUrl: { not: { contains: '/staging/' } } }] })
    // When browsing for missing covers, exclude terminal statuses — same logic as missingCoverCount
    if (!filters.status?.length) {
      conditions.push({ status: { notIn: ['PROMOTED', 'INACTIVE'] } })
    }
  }

  if (filters.noDate) {
    conditions.push({ releaseDate: null, releaseDateSuggestion: null })
  }

  if (filters.hasDateSuggestion) {
    conditions.push({ releaseDate: null, releaseDateSuggestion: { not: null } })
  }

  if (filters.search) {
    const term = filters.search.toLowerCase()
    conditions.push({
      OR: [
        { titleNorm: { contains: term } },
        { channelName: { contains: filters.search, mode: 'insensitive' } },
        { artistNorm: { contains: term } },
        { subjectIcgId: { contains: term, mode: 'insensitive' } },
        { participantNamesNorm: { contains: term } },
      ],
    })
  }

  if (conditions.length > 0) {
    where.AND = conditions
  }

  // Sort — always include { id: 'asc' } as final tiebreaker so cursor
  // pagination is deterministic even when primary sort columns have duplicates.
  const sortDir = filters.sortDir ?? 'asc'
  let orderBy: Prisma.StagingSetOrderByWithRelationInput[]
  switch (filters.sort) {
    case 'title':
      orderBy = [{ titleNorm: sortDir }, { releaseDate: 'asc' }, { id: 'asc' }]
      break
    case 'priority':
      orderBy = [{ priority: { sort: sortDir, nulls: 'last' } }, { releaseDate: 'asc' }, { id: 'asc' }]
      break
    case 'importDate':
      orderBy = [{ createdAt: sortDir }, { id: 'asc' }]
      break
    case 'undatedFirst':
      orderBy = [{ releaseDate: { sort: 'asc', nulls: 'first' } }, { title: 'asc' }, { id: 'asc' }]
      break
    default: // 'date'
      orderBy = [{ releaseDate: { sort: sortDir, nulls: 'last' } }, { title: 'asc' }, { id: 'asc' }]
  }

  const limit = filters.limit ?? 100

  const findArgs = {
    where,
    include: STAGING_SET_INCLUDE,
    orderBy,
    take: limit + 1,
    skip: 0 as number,
    cursor: undefined as { id: string } | undefined,
  }

  // Prefer offset pagination (reliable with any sort order).
  // Fall back to cursor pagination for backwards compatibility.
  if (filters.offset != null) {
    findArgs.skip = filters.offset
  } else if (filters.cursor) {
    findArgs.cursor = { id: filters.cursor }
    findArgs.skip = 1
  }

  const [items, total] = await Promise.all([
    prisma.stagingSet.findMany(findArgs),
    prisma.stagingSet.count({ where }),
  ])

  const hasMore = items.length > limit
  if (hasMore) items.pop()

  return {
    items,
    total,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  }
}

// ─── Stats ─────────────────────────────────────────────────────────────────

export type StagingSetStats = {
  total: number
  byStatus: Record<string, number>
  byMatchType: { none: number; exact: number; probable: number }
  byType: { photo: number; video: number }
  duplicateCount: number
  noDateCount: number
  dateSuggestionCount: number
  missingCoverCount: number
}

export async function getStagingSetStats(batchId?: string): Promise<StagingSetStats> {
  const where: Prisma.StagingSetWhereInput = batchId ? { importBatchId: batchId } : {}

  const [total, statusCounts, exactCount, probableCount, videoCount, duplicateCount, noDateCount, dateSuggestionCount, missingCoverCount] = await Promise.all([
    prisma.stagingSet.count({ where }),
    prisma.stagingSet.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.stagingSet.count({
      where: { ...where, matchedSetId: { not: null }, matchConfidence: 1.0 },
    }),
    prisma.stagingSet.count({
      where: { ...where, matchedSetId: { not: null }, matchConfidence: { lt: 1.0 } },
    }),
    prisma.stagingSet.count({
      where: { ...where, isVideo: true },
    }),
    prisma.stagingSet.count({
      where: { ...where, OR: [{ isDuplicate: true }, { duplicateGroupId: { not: null } }] },
    }),
    prisma.stagingSet.count({
      where: { ...where, releaseDate: null, releaseDateSuggestion: null },
    }),
    prisma.stagingSet.count({
      where: { ...where, releaseDate: null, releaseDateSuggestion: { not: null } },
    }),
    prisma.stagingSet.count({
      where: { ...where, OR: [{ coverImageUrl: null }, { coverImageUrl: { not: { contains: '/staging/' } } }], status: { notIn: ['PROMOTED', 'INACTIVE'] } },
    }),
  ])

  const byStatus: Record<string, number> = {}
  for (const row of statusCounts) {
    byStatus[row.status] = row._count
  }

  return {
    total,
    byStatus,
    byMatchType: {
      none: total - exactCount - probableCount,
      exact: exactCount,
      probable: probableCount,
    },
    byType: {
      photo: total - videoCount,
      video: videoCount,
    },
    duplicateCount,
    noDateCount,
    dateSuggestionCount,
    missingCoverCount,
  }
}

// ─── Field Editing ─────────────────────────────────────────────────────────

export async function updateStagingSetFields(
  id: string,
  data: Partial<{
    title: string
    channelName: string
    channelId: string | null
    releaseDate: Date | null
    releaseDatePrecision: DatePrecision
    isVideo: boolean
    imageCount: number | null
    artist: string | null
    description: string | null
    notes: string | null
    priority: number | null
    status: StagingSetStatus
    matchConfidence: number | null
    matchedSetId: string | null
    matchDetails: string | null
    isDuplicate: boolean
    duplicateGroupId: string | null
  }>,
): Promise<StagingSet> {
  const updateData: Prisma.StagingSetUpdateInput = { ...data }

  // Auto-compute normalized fields
  if ('title' in data && data.title !== undefined) {
    updateData.titleNorm = normalizeForSearch(data.title)
  }
  if ('artist' in data) {
    updateData.artistNorm = data.artist ? normalizeForSearch(data.artist) : null
  }

  return prisma.stagingSet.update({
    where: { id },
    data: updateData,
  })
}

// ─── Bulk Operations ───────────────────────────────────────────────────────

export async function bulkUpdateStatus(
  ids: string[],
  status: StagingSetStatus,
): Promise<number> {
  const result = await prisma.stagingSet.updateMany({
    where: { id: { in: ids } },
    data: { status },
  })
  return result.count
}

// backfillPromotedSetArchiveLinks() deleted — structurally impossible in ArchiveLink model.
