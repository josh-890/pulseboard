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

// ─── Types ──────────────────────────────────────────────────────────────────

export type StagingSetWithRelations = StagingSet & {
  channel: { id: string; name: string; tier: ChannelTier } | null
  matchedSet: { id: string; title: string; channelId: string | null } | null
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

export async function getStagingSetsForBatch(batchId: string): Promise<StagingSetWithRelations[]> {
  return prisma.stagingSet.findMany({
    where: { importBatchId: batchId },
    include: {
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
    },
    orderBy: [{ releaseDate: 'asc' }, { title: 'asc' }],
  })
}

export async function getStagingSetById(id: string): Promise<StagingSetWithRelations | null> {
  return prisma.stagingSet.findUnique({
    where: { id },
    include: {
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
    },
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
    include: {
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
    },
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
    include: {
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
    },
    orderBy: [{ releaseDate: 'asc' }, { title: 'asc' }],
  })
}

export async function getStagingSetDuplicateGroup(
  groupId: string,
): Promise<StagingSetWithRelations[]> {
  return prisma.stagingSet.findMany({
    where: { duplicateGroupId: groupId },
    include: {
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
  })
}

// ─── Comparison ─────────────────────────────────────────────────────────────

export async function getStagingSetComparison(
  stagingSetId: string,
): Promise<StagingSetComparison | null> {
  const stagingSet = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    include: {
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
    },
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
        channel: { select: { id: true, name: true, tier: true } },
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

export async function markStagingSetPromoted(
  id: string,
  promotedSetId: string,
): Promise<StagingSet> {
  return prisma.stagingSet.update({
    where: { id },
    data: {
      status: 'PROMOTED',
      promotedSetId,
    },
  })
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
    conditions.push({ isDuplicate: true })
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
      channel: { select: { id: true, name: true, tier: true } },
      matchedSet: { select: { id: true, title: true, channelId: true } },
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
      where: { ...where, isDuplicate: true },
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
