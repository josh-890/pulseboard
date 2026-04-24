/**
 * StagingSet service — CRUD, querying, comparison, and promotion.
 *
 * StagingSets persist import data across batches, enabling
 * cross-person set discovery, channel timeline views, and
 * progressive enrichment of existing Sets.
 */

import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import type { ChannelTier, DatePrecision, Prisma, StagingSet, StagingSetStatus } from '@/generated/prisma/client'
import { onSetPromoted, onArchiveFolderLinked } from '@/lib/services/coherence-service'
import type { SuggestedFolderInfo } from '@/lib/services/archive-service'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CoherenceSnapshotMini = {
  archiveFolderId: string | null
  archiveStatus: string
  archiveFileCount: number | null
  hasMediaInApp: boolean
  archiveFolder: { id: string; folderName: string; fullPath: string; scannedAt: Date } | null
} | null

export type PromotedSetArchiveMini = {
  id: string
  archivePath: string | null
  archiveStatus: string
  archiveFileCount: number | null
  archiveVideoPresent: boolean | null
  archiveFolder: { id: string; folderName: string; fullPath: string; scannedAt: Date } | null
} | null

export type StagingSetWithRelations = StagingSet & {
  channel: { id: string; name: string; tier: ChannelTier; shortName: string | null; channelFolder: string | null } | null
  matchedSet: { id: string; title: string; channelId: string | null } | null
  coherenceSnapshot: CoherenceSnapshotMini
  promotedSet: PromotedSetArchiveMini
  /** Populated server-side after main query via getSuggestedFoldersForStagingSets */
  suggestedArchiveFolder?: SuggestedFolderInfo | null
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

const STAGING_SET_INCLUDE = {
  channel: { select: { id: true, name: true, tier: true, shortName: true, channelFolder: true } },
  matchedSet: { select: { id: true, title: true, channelId: true } },
  coherenceSnapshot: {
    select: {
      archiveFolderId: true,
      archiveStatus: true,
      archiveFileCount: true,
      hasMediaInApp: true,
      archiveFolder: { select: { id: true, folderName: true, fullPath: true, scannedAt: true } },
    },
  },
  promotedSet: {
    select: {
      id: true,
      archivePath: true,
      archiveStatus: true,
      archiveFileCount: true,
      archiveVideoPresent: true,
      archiveFolder: { select: { id: true, folderName: true, fullPath: true, scannedAt: true } },
    },
  },
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
  return prisma.stagingSet.update({
    where: { id },
    data: {
      status,
      ...(notes !== undefined ? { notes } : {}),
    },
  })
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
  // Fetch archiveFolderId before transaction so we can conditionally include the folder update
  const pre = await prisma.stagingSet.findUnique({
    where: { id },
    select: { archiveFolderId: true },
  })

  const stagingSet = await prisma.$transaction(async (tx) => {
    const updated = await tx.stagingSet.update({
      where: { id },
      data: { status: 'PROMOTED', promotedSetId, mediaQueueAt: null, mediaPriority: null },
    })
    // If a folder is linked, write linkedSetId on the folder (keep archiveFolderId on staging set as history)
    if (pre?.archiveFolderId) {
      await tx.archiveFolder.update({
        where: { id: pre.archiveFolderId },
        data: { linkedSetId: promotedSetId },
      })
    }
    // Migrate any stale archive folder suggestions pointing at this staging set → point at the promoted Set
    await tx.archiveFolder.updateMany({
      where: { suggestedStagingId: id },
      data: { suggestedStagingId: null, suggestedSetId: promotedSetId },
    })
    return updated
  })

  // Transfer archive link from staging set to the promoted Set.
  const ss = await prisma.stagingSet.findUnique({
    where: { id },
    select: { archiveKey: true, archivePath: true, archiveStatus: true, archiveFolderId: true },
  })

  if (ss?.archiveFolderId) {
    // Staging set has a real scanner-confirmed archive folder — transfer the link to the promoted Set
    const folder = await prisma.archiveFolder.findUnique({
      where: { id: ss.archiveFolderId },
      select: { relativePath: true, fileCount: true, videoPresent: true },
    })
    // Point ArchiveFolder directly at the promoted Set (not just the staging set)
    await prisma.archiveFolder.updateMany({
      where: { id: ss.archiveFolderId, linkedSetId: null },
      data: { linkedSetId: promotedSetId },
    })
    // Update Set's archive fields from the folder (if Set has none yet)
    await prisma.set.updateMany({
      where: { id: promotedSetId, archiveStatus: 'UNKNOWN' },
      data: {
        archiveKey: ss.archiveKey ?? undefined,
        ...(folder?.relativePath ? {
          archivePath: folder.relativePath,
          archiveStatus: 'OK',
          archiveFileCount: folder.fileCount ?? null,
          archiveVideoPresent: folder.videoPresent ?? null,
        } : {}),
      },
    })
    await onArchiveFolderLinked(ss.archiveFolderId, { setId: promotedSetId })
  } else {
    // No real folder link — fall back to copying raw path/status strings from staging set
    if (ss?.archiveKey) {
      await prisma.set.updateMany({
        where: { id: promotedSetId, archiveKey: null },
        data: { archiveKey: ss.archiveKey },
      })
    }
    if (ss?.archivePath) {
      await prisma.set.updateMany({
        where: { id: promotedSetId, archivePath: null },
        data: { archivePath: ss.archivePath, archiveStatus: ss.archiveStatus },
      })
    }
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
  personId?: string
  channelId?: string
  channelTier?: ChannelTier[]
  dateFrom?: string
  dateTo?: string
  batchId?: string
  priority?: number[]
  archiveFilter?: 'hasPath' | 'ok' | 'changed' | 'missing' | 'inQueue' | 'needsMedia'
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
    conditions.push({
      OR: [
        { subjectPersonId: filters.personId },
        { subjectIcgId: filters.personId },
        { participantIcgIds: { has: filters.personId } },
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
    switch (filters.archiveFilter) {
      case 'hasPath':
        conditions.push({ archivePath: { not: null } })
        break
      case 'ok':
        conditions.push({ archiveStatus: 'OK' })
        break
      case 'changed':
        conditions.push({ archiveStatus: 'CHANGED' })
        break
      case 'missing':
        conditions.push({ archiveStatus: 'MISSING' })
        break
      case 'inQueue':
        conditions.push({ mediaQueueAt: { not: null } })
        break
      case 'needsMedia':
        conditions.push({ archivePath: null, mediaQueueAt: null })
        break
    }
  }

  if (filters.isVideo !== undefined) {
    conditions.push({ isVideo: filters.isVideo })
  }

  if (filters.noDate) {
    conditions.push({ releaseDate: null })
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
    include: {
      channel: { select: { id: true, name: true, tier: true, shortName: true, channelFolder: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
      coherenceSnapshot: {
        select: {
          archiveFolderId: true,
          archiveStatus: true,
          archiveFileCount: true,
          hasMediaInApp: true,
          archiveFolder: { select: { id: true, folderName: true, fullPath: true, scannedAt: true } } as const,
        },
      },
      promotedSet: {
        select: {
          id: true,
          archivePath: true,
          archiveStatus: true,
          archiveFileCount: true,
          archiveVideoPresent: true,
          archiveFolder: { select: { id: true, folderName: true, fullPath: true, scannedAt: true } },
        },
      },
    } as const,
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
}

export async function getStagingSetStats(batchId?: string): Promise<StagingSetStats> {
  const where: Prisma.StagingSetWhereInput = batchId ? { importBatchId: batchId } : {}

  const [total, statusCounts, exactCount, probableCount, videoCount, duplicateCount] = await Promise.all([
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

// ─── Archive Link Backfill ─────────────────────────────────────────────────

/**
 * One-time backfill: for every PROMOTED staging set that has an archiveFolderId
 * but whose promoted Set has no ArchiveFolder.linkedSetId, migrate the link.
 *
 * This fixes sets that were promoted before the markStagingSetPromoted
 * archive transfer was added.
 */
export async function backfillPromotedSetArchiveLinks(): Promise<{ fixed: number; snapshotOnly: number; skipped: number }> {
  // Pass 1: staging sets whose archiveFolderId has not yet been transferred to linkedSetId
  const promoted = await prisma.stagingSet.findMany({
    where: {
      status: 'PROMOTED',
      archiveFolderId: { not: null },
      promotedSetId: { not: null },
    },
    select: {
      id: true,
      archiveFolderId: true,
      promotedSetId: true,
      archiveFolder: {
        select: { id: true, linkedSetId: true, relativePath: true, fileCount: true, videoPresent: true },
      },
    },
  })

  let fixed = 0
  let snapshotOnly = 0
  let skipped = 0

  for (const ss of promoted) {
    const folder = ss.archiveFolder
    if (!folder || !ss.promotedSetId) { skipped++; continue }

    if (folder.linkedSetId) {
      // Folder already points at some set — ensure the coherence snapshot is wired up
      // (the onArchiveFolderLinked call was missing before this fix was deployed)
      const snap = await prisma.setCoherenceSnapshot.findFirst({
        where: { archiveFolderId: folder.id, setId: ss.promotedSetId },
        select: { id: true },
      })
      if (!snap) {
        await onArchiveFolderLinked(folder.id, { setId: folder.linkedSetId })
        snapshotOnly++
      } else {
        skipped++
      }
      continue
    }

    // Skip if the promoted Set already has a different archive folder pointing at it
    const existingLink = await prisma.archiveFolder.findFirst({
      where: { linkedSetId: ss.promotedSetId },
      select: { id: true },
    })
    if (existingLink) { skipped++; continue }

    // Transfer the folder link to the promoted Set
    await prisma.archiveFolder.updateMany({
      where: { id: folder.id, linkedSetId: null },
      data: { linkedSetId: ss.promotedSetId },
    })

    // Update Set archive fields from folder data
    await prisma.set.updateMany({
      where: { id: ss.promotedSetId, archiveStatus: 'UNKNOWN' },
      data: {
        ...(folder.relativePath ? {
          archivePath: folder.relativePath,
          archiveStatus: 'OK',
          archiveFileCount: folder.fileCount ?? null,
          archiveVideoPresent: folder.videoPresent ?? null,
        } : {}),
      },
    })

    await onArchiveFolderLinked(folder.id, { setId: ss.promotedSetId })
    fixed++
  }

  // Pass 2: archive folders directly linked to a Set (linkedSetId set) but whose
  // coherence snapshot is missing the archiveFolderId — covers sets confirmed directly
  // on the Set detail page before the onArchiveFolderLinked fix was deployed.
  const directLinks = await prisma.archiveFolder.findMany({
    where: { linkedSetId: { not: null } },
    select: { id: true, linkedSetId: true },
  })

  for (const folder of directLinks) {
    if (!folder.linkedSetId) continue
    const snap = await prisma.setCoherenceSnapshot.findFirst({
      where: { archiveFolderId: folder.id, setId: folder.linkedSetId },
      select: { id: true },
    })
    if (!snap) {
      await onArchiveFolderLinked(folder.id, { setId: folder.linkedSetId })
      snapshotOnly++
    }
  }

  // Pass 3: Sets where ArchiveFolder.linkedSetId points to them but Set.archiveStatus
  // is still UNKNOWN — the folder link exists but the Set's own fields were never updated.
  const setsWithLinkedFolderUnknown = await prisma.set.findMany({
    where: {
      archiveStatus: 'UNKNOWN',
      archiveFolder: { isNot: null },
    },
    select: {
      id: true,
      archiveFolder: {
        select: { id: true, relativePath: true, fileCount: true, videoPresent: true },
      },
    },
  })

  for (const set of setsWithLinkedFolderUnknown) {
    const folder = set.archiveFolder
    if (!folder) continue
    if (!folder.relativePath) { skipped++; continue }
    await prisma.set.update({
      where: { id: set.id },
      data: {
        archivePath: folder.relativePath,
        archiveStatus: 'OK',
        archiveFileCount: folder.fileCount ?? null,
        archiveVideoPresent: folder.videoPresent ?? null,
      },
    })
    fixed++
  }

  return { fixed, snapshotOnly, skipped }
}
