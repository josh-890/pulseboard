/**
 * Staging service — orchestrates the import pipeline.
 *
 * Creates batches from parsed files, manages item states,
 * refreshes DB matches dynamically, and computes dependencies.
 */

import { prisma } from '@/lib/db'
import type { ImportBatch, ImportItem, ImportItemStatus, ImportItemType } from '@/generated/prisma/client'
import {
  parseImportFile,
  parseFilename,
  extractUniqueChannels,
  extractUniqueCoModels,
  detectPotentialDuplicates,
} from './parser'
import type { ParsedSet } from './parser'
import { matchAllEntities } from './matcher'
import { normalizeForSearch } from '@/lib/services/alias-service'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportBatchWithItems = ImportBatch & {
  items: ImportItem[]
}

export type ImportBatchSummary = {
  id: string
  filename: string
  subjectName: string
  subjectIcgId: string
  status: ImportBatch['status']
  extractionDate: Date | null
  createdAt: Date
  itemCounts: Record<ImportItemStatus, number>
  totalItems: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract a human-readable platform name from a URL domain. */
const DOMAIN_TO_PLATFORM: Record<string, string> = {
  'thenude.com': 'THENUDE',
  'indexxx.com': 'Indexxx',
  'freeones.com': 'FreeOnes',
  'babepedia.com': 'Babepedia',
  'iafd.com': 'IAFD',
  'boobpedia.com': 'Boobpedia',
  'egafd.com': 'EGAFD',
}

function detectPlatformFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    for (const [domain, platform] of Object.entries(DOMAIN_TO_PLATFORM)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return platform
    }
    // Fallback: capitalize the domain name without TLD
    const parts = hostname.split('.')
    if (parts.length >= 2) {
      const name = parts[parts.length - 2]
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
  } catch {
    // Invalid URL
  }
  return 'Source'
}

// ─── Create Batch ───────────────────────────────────────────────────────────

export async function createBatch(
  filename: string,
  rawContent: string,
): Promise<ImportBatchWithItems> {
  const filenameMeta = parseFilename(filename)
  const parsed = parseImportFile(rawContent)
  const matches = await matchAllEntities(parsed)
  const duplicates = detectPotentialDuplicates(parsed.sets)

  // Build duplicate lookup: setIndex → list of duplicate partner indices
  const dupeMap = new Map<number, number[]>()
  for (const group of duplicates) {
    for (const idx of group.setIndices) {
      dupeMap.set(
        idx,
        group.setIndices.filter((i) => i !== idx),
      )
    }
  }

  // Check for previous batch with same ICG ID
  const previousBatch = await prisma.importBatch.findFirst({
    where: { subjectIcgId: parsed.person.icgId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })

  const items: Array<{
    type: ImportItemType
    data: Record<string, unknown>
    rawText: string | null
    sortOrder: number
    status: ImportItemStatus
    matchedEntityId: string | null
    matchConfidence: number | null
    matchDetails: string | null
    dependsOn: string[]
    blockedReason: string | null
  }> = []

  // ── Channels (standalone — label resolved via channel linking) ─────────
  const uniqueChannels = extractUniqueChannels(parsed)
  for (const channelName of uniqueChannels) {
    const channelMatch = matches.channels.get(channelName)
    const status: ImportItemStatus =
      channelMatch?.matchedEntityId
        ? channelMatch.matchConfidence === 1.0
          ? 'MATCHED'
          : 'PROBABLE'
        : 'NEW'

    items.push({
      type: 'CHANNEL',
      data: { name: channelName },
      rawText: null,
      sortOrder: 10,
      status,
      matchedEntityId: channelMatch?.matchedEntityId ?? null,
      matchConfidence: channelMatch?.matchConfidence ?? null,
      matchDetails: channelMatch?.matchDetails ?? null,
      dependsOn: [],
      blockedReason: null,
    })
  }

  // ── Person (subject, tier 2) ──────────────────────────────────────────
  const personMatch = matches.person
  const personStatus: ImportItemStatus =
    personMatch.matchedEntityId
      ? personMatch.matchConfidence === 1.0
        ? 'MATCHED'
        : 'PROBABLE'
      : 'NEW'

  items.push({
    type: 'PERSON',
    data: parsed.person,
    rawText: null,
    sortOrder: 20,
    status: personStatus,
    matchedEntityId: personMatch.matchedEntityId ?? null,
    matchConfidence: personMatch.matchConfidence ?? null,
    matchDetails: personMatch.matchDetails ?? null,
    dependsOn: [],
    blockedReason: null,
  })

  // ── Aliases (tier 3, depend on person + channel) ──────────────────────
  // Driven exclusively by channel appearances (Channel/Name blocks).
  // Each appearance becomes a PERSON_ALIAS item linked to its channel.
  for (const ca of parsed.channelAppearances) {
    items.push({
      type: 'PERSON_ALIAS',
      data: {
        name: ca.aliasOnChannel,
        channelName: ca.channelName,
      },
      rawText: null,
      sortOrder: 30,
      status: 'NEW',
      matchedEntityId: null,
      matchConfidence: null,
      matchDetails: null,
      dependsOn: [
        `PERSON:${parsed.person.icgId}`,
        `CHANNEL:${ca.channelName.toUpperCase()}`,
      ],
      blockedReason: null,
    })
  }

  // ── Digital Identities (tier 3, depend on person) ─────────────────────
  // Add source URL as first identity — detect platform from domain
  if (parsed.person.sourceUrl) {
    const platform = detectPlatformFromUrl(parsed.person.sourceUrl)
    items.push({
      type: 'DIGITAL_IDENTITY',
      data: {
        platform,
        handle: parsed.person.icgId,
        url: parsed.person.sourceUrl,
      },
      rawText: null,
      sortOrder: 31,
      status: 'NEW',
      matchedEntityId: null,
      matchConfidence: null,
      matchDetails: null,
      dependsOn: [`PERSON:${parsed.person.icgId}`],
      blockedReason: null,
    })
  }

  for (const di of parsed.digitalIdentities) {
    items.push({
      type: 'DIGITAL_IDENTITY',
      data: {
        platform: di.platform,
        url: di.url,
      },
      rawText: null,
      sortOrder: 31,
      status: 'NEW',
      matchedEntityId: null,
      matchConfidence: null,
      matchDetails: null,
      dependsOn: [`PERSON:${parsed.person.icgId}`],
      blockedReason: null,
    })
  }

  // ── Co-Models (tier 2, independent) ───────────────────────────────────
  const uniqueCoModels = extractUniqueCoModels(parsed)
  for (const cm of uniqueCoModels) {
    const cmMatch = matches.coModels.get(cm.icgId)
    const status: ImportItemStatus =
      cmMatch?.matchedEntityId
        ? cmMatch.matchConfidence === 1.0
          ? 'MATCHED'
          : 'PROBABLE'
        : 'NEW'

    items.push({
      type: 'CO_MODEL',
      data: {
        name: cm.name,
        icgId: cm.icgId,
        url: cm.url,
        thumbUrl: cm.thumbUrl,
      },
      rawText: null,
      sortOrder: 25,
      status,
      matchedEntityId: cmMatch?.matchedEntityId ?? null,
      matchConfidence: cmMatch?.matchConfidence ?? null,
      matchDetails: cmMatch?.matchDetails ?? null,
      dependsOn: [],
      blockedReason: null,
    })
  }

  // ── Sets (tier 4, depend on channel + person + co-models) ─────────────
  for (let idx = 0; idx < parsed.sets.length; idx++) {
    const set = parsed.sets[idx]
    const setMatch = matches.sets.get(set.externalId)
    const status: ImportItemStatus =
      setMatch?.matchedEntityId
        ? setMatch.matchConfidence === 1.0
          ? 'MATCHED'
          : 'PROBABLE'
        : 'NEW'

    // Compute dependencies
    const deps: string[] = [
      `CHANNEL:${set.channelName.toUpperCase()}`,
      `PERSON:${parsed.person.icgId}`,
    ]

    // Add co-model dependencies
    for (const model of set.modelsList) {
      if (model.icgId !== parsed.person.icgId) {
        deps.push(`CO_MODEL:${model.icgId}`)
      }
    }

    // Check duplicate partners
    const dupePartners = dupeMap.get(idx)
    const dupeInfo = dupePartners
      ? dupePartners.map((pi) => ({
          title: parsed.sets[pi].title,
          channel: parsed.sets[pi].channelName,
          externalId: parsed.sets[pi].externalId,
        }))
      : null

    items.push({
      type: 'SET',
      data: {
        ...set,
        duplicateOf: dupeInfo,
      },
      rawText: null,
      sortOrder: 40,
      status,
      matchedEntityId: setMatch?.matchedEntityId ?? null,
      matchConfidence: setMatch?.matchConfidence ?? null,
      matchDetails: setMatch?.matchDetails ?? null,
      dependsOn: deps,
      blockedReason: null,
    })
  }

  // ── Credits (artist names as SetCreditRaw, tier 5) ────────────────────
  const uniqueArtists = new Set<string>()
  for (const set of parsed.sets) {
    if (set.artist) uniqueArtists.add(set.artist)
  }
  for (const artist of uniqueArtists) {
    items.push({
      type: 'CREDIT',
      data: { name: artist },
      rawText: null,
      sortOrder: 50,
      status: 'NEW',
      matchedEntityId: null,
      matchConfidence: null,
      matchDetails: null,
      dependsOn: [], // Credits are created per-set during set import
      blockedReason: null,
    })
  }

  // ── Create the batch in DB ────────────────────────────────────────────
  const batch = await prisma.importBatch.create({
    data: {
      filename,
      subjectName: parsed.person.name,
      subjectIcgId: parsed.person.icgId,
      status: 'REVIEW',
      rawContent,
      parsedAt: new Date(),
      extractionDate: filenameMeta.extractionDate
        ? new Date(filenameMeta.extractionDate)
        : null,
      previousBatchId: previousBatch?.id ?? null,
      items: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json fields require `any` for nested create
        create: items as any,
      },
    },
    include: { items: true },
  })

  // Now compute blocked status based on actual item IDs
  await computeDependencies(batch.id)

  // ── Create StagingSet records for each SET ImportItem ──────────────
  await createStagingSetsForBatch(batch.id, parsed.sets, parsed.person.icgId, matches)

  // Re-fetch with updated statuses
  return prisma.importBatch.findUniqueOrThrow({
    where: { id: batch.id },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

// ─── Create StagingSet Records ──────────────────────────────────────────────

type StagingIngestSummary = {
  created: number
  skipped: number
  byMatchType: { none: number; exact: number; probable: number }
}

async function createStagingSetsForBatch(
  batchId: string,
  parsedSets: ParsedSet[],
  subjectIcgId: string,
  matches: Awaited<ReturnType<typeof matchAllEntities>>,
): Promise<StagingIngestSummary> {
  const summary: StagingIngestSummary = {
    created: 0,
    skipped: 0,
    byMatchType: { none: 0, exact: 0, probable: 0 },
  }

  // Get SET import items to link
  const setItems = await prisma.importItem.findMany({
    where: { batchId, type: 'SET' },
    select: { id: true, data: true },
    orderBy: { createdAt: 'asc' },
  })

  // Resolve person if already in DB
  const person = await prisma.person.findUnique({
    where: { icgId: subjectIcgId },
    select: { id: true },
  })

  // Batch lookup for participant resolution statuses
  const allParticipantIcgIds = new Set<string>()
  const allParticipantNames = new Set<string>()
  for (const set of parsedSets) {
    for (const m of set.modelsList) {
      allParticipantIcgIds.add(m.icgId)
      allParticipantNames.add(normalizeForSearch(m.name))
    }
  }

  const knownPersons = await prisma.person.findMany({
    where: { icgId: { in: Array.from(allParticipantIcgIds) } },
    select: { id: true, icgId: true },
  })
  const personByIcgId = new Map(knownPersons.map((p) => [p.icgId, p.id]))

  const candidateAliases = await prisma.personAlias.findMany({
    where: { nameNorm: { in: Array.from(allParticipantNames) } },
    select: { nameNorm: true },
  })
  const candidateNameNorms = new Set(candidateAliases.map((a) => a.nameNorm))

  // Batch fetch headshot thumbnails for known persons
  const { getHeadshotsForPersons } = await import('@/lib/services/media-service')
  const headshotMap = await getHeadshotsForPersons(Array.from(personByIcgId.values()))

  for (let idx = 0; idx < parsedSets.length; idx++) {
    const set = parsedSets[idx]
    const importItem = setItems[idx]
    if (!importItem) continue

    // Re-import protection: skip if this exact set already exists in staging for this person
    if (set.externalId) {
      const existing = await prisma.stagingSet.findFirst({
        where: { externalId: set.externalId, subjectIcgId },
        select: { id: true },
      })
      if (existing) {
        summary.skipped++
        continue
      }
    }

    const setMatch = matches.sets.get(set.externalId)
    const participantIcgIds = set.modelsList.map((m) => m.icgId)

    // Track match type for summary
    if (setMatch?.matchedEntityId) {
      if (setMatch.matchConfidence === 1.0) summary.byMatchType.exact++
      else summary.byMatchType.probable++
    } else {
      summary.byMatchType.none++
    }

    // Resolve channel if already matched
    const channelName = set.channelName.toUpperCase()
    const channelMatch = matches.channels.get(channelName)
    const channelId = channelMatch?.matchedEntityId ?? null

    // Parse release date precision
    let releaseDatePrecision: 'UNKNOWN' | 'YEAR' | 'MONTH' | 'DAY' = 'UNKNOWN'
    if (set.date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(set.date)) releaseDatePrecision = 'DAY'
      else if (/^\d{4}-\d{2}$/.test(set.date)) releaseDatePrecision = 'MONTH'
      else if (/^\d{4}$/.test(set.date)) releaseDatePrecision = 'YEAR'
    }

    // Cross-batch duplicate detection: check existing staging sets by externalId
    let duplicateGroupId: string | null = null
    if (set.externalId) {
      const existingStaging = await prisma.stagingSet.findFirst({
        where: { externalId: set.externalId },
        select: { duplicateGroupId: true, id: true },
      })
      if (existingStaging) {
        // Join existing group or create one from the existing record's ID
        duplicateGroupId = existingStaging.duplicateGroupId ?? existingStaging.id
        // Ensure the existing record also has the group ID
        if (!existingStaging.duplicateGroupId) {
          await prisma.stagingSet.update({
            where: { id: existingStaging.id },
            data: { duplicateGroupId },
          })
        }
      }
    }

    // Compute participant resolution statuses
    const participantStatuses = set.modelsList.map((m) => {
      const personId = personByIcgId.get(m.icgId)
      if (personId) {
        const headshot = headshotMap.get(personId)
        return {
          name: m.name, icgId: m.icgId, status: 'known' as const,
          personId, thumbnailUrl: headshot?.url,
        }
      }
      const nameNorm = normalizeForSearch(m.name)
      if (candidateNameNorms.has(nameNorm)) {
        return { name: m.name, icgId: m.icgId, status: 'candidate' as const }
      }
      return { name: m.name, icgId: m.icgId, status: 'new' as const }
    })

    await prisma.stagingSet.create({
      data: {
        title: set.title,
        titleNorm: normalizeForSearch(set.title),
        externalId: set.externalId || null,
        channelName: set.channelName,
        channelId,
        releaseDate: set.date ? new Date(set.date) : null,
        releaseDatePrecision,
        isVideo: set.isVideo,
        imageCount: set.imageCount,
        artist: set.artist,
        artistNorm: set.artist ? normalizeForSearch(set.artist) : null,
        coverImageUrl: set.coverImageUrl,
        description: set.description,
        participants: set.modelsList,
        participantIcgIds,
        participantNamesNorm: set.modelsList.length > 0
          ? set.modelsList.map((m) => normalizeForSearch(m.name)).join(', ')
          : null,
        participantStatuses,
        importBatchId: batchId,
        importItemId: importItem.id,
        subjectPersonId: person?.id ?? null,
        subjectIcgId,
        matchedSetId: setMatch?.matchedEntityId ?? null,
        matchConfidence: setMatch?.matchConfidence ?? null,
        matchDetails: setMatch?.matchDetails ?? null,
        status: 'PENDING',
        duplicateGroupId,
      },
    })
    summary.created++
  }

  // Store summary on the batch for quick display
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { stagingSummary: summary },
  })

  return summary
}

// ─── Refresh Batch Matches ──────────────────────────────────────────────────

export async function refreshBatchMatches(batchId: string): Promise<ImportBatchWithItems> {
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })

  // Re-parse the raw content to get structured data
  const parsed = parseImportFile(batch.rawContent)
  const matches = await matchAllEntities(parsed)

  // Update each non-imported, non-skipped item with fresh match data
  for (const item of batch.items) {
    if (item.status === 'IMPORTED' || item.status === 'SKIPPED') continue

    // Don't downgrade manually resolved items — if an item was already matched
    // (e.g., via channel linking) but the auto-matcher can't find it, keep the manual resolution
    let newMatch: { matchedEntityId: string | null; matchConfidence: number | null; matchDetails: string | null } | null = null
    const data = item.data as Record<string, unknown>

    switch (item.type) {
      case 'PERSON': {
        newMatch = matches.person
        break
      }
      case 'CO_MODEL': {
        const icgId = data.icgId as string
        newMatch = matches.coModels.get(icgId) ?? null
        break
      }
      case 'CHANNEL': {
        const name = data.name as string
        newMatch = matches.channels.get(name.toUpperCase()) ?? null
        break
      }
      case 'LABEL': {
        const name = data.name as string
        newMatch = matches.labels.get(name.toUpperCase()) ?? null
        break
      }
      case 'SET': {
        const externalId = data.externalId as string
        newMatch = matches.sets.get(externalId) ?? null
        break
      }
      case 'DIGITAL_IDENTITY': {
        const key = `${data.platform}:${data.url || data.handle || ''}`
        newMatch = matches.identities.get(key) ?? null
        break
      }
      default:
        continue
    }

    // Preserve manually resolved items when auto-matcher finds nothing
    if (item.matchedEntityId && item.status === 'MATCHED' && (!newMatch || !newMatch.matchedEntityId)) {
      continue
    }

    if (newMatch) {
      const newStatus: ImportItemStatus =
        newMatch.matchedEntityId
          ? newMatch.matchConfidence === 1.0
            ? 'MATCHED'
            : 'PROBABLE'
          : item.status === 'BLOCKED'
            ? 'BLOCKED'
            : 'NEW'

      await prisma.importItem.update({
        where: { id: item.id },
        data: {
          status: newStatus,
          matchedEntityId: newMatch.matchedEntityId,
          matchConfidence: newMatch.matchConfidence,
          matchDetails: newMatch.matchDetails,
        },
      })
    }
  }

  // Recompute dependencies
  await computeDependencies(batchId)

  // Refresh StagingSet records: update match data, resolve channelId/subjectPersonId
  await refreshStagingSets(batchId, parsed, matches)

  return prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

async function refreshStagingSets(
  batchId: string,
  parsed: ReturnType<typeof parseImportFile>,
  matches: Awaited<ReturnType<typeof matchAllEntities>>,
): Promise<void> {
  const stagingSets = await prisma.stagingSet.findMany({
    where: { importBatchId: batchId },
    select: { id: true, externalId: true, status: true },
  })

  // Resolve person
  const person = await prisma.person.findUnique({
    where: { icgId: parsed.person.icgId },
    select: { id: true },
  })

  for (const ss of stagingSets) {
    // Skip terminal statuses
    if (ss.status === 'PROMOTED' || ss.status === 'INACTIVE' || ss.status === 'SKIPPED') continue

    // Re-match set
    const setMatch = ss.externalId ? matches.sets.get(ss.externalId) ?? null : null

    // Find the matching parsed set to resolve channel
    const parsedSet = parsed.sets.find((s) => s.externalId === ss.externalId)
    const channelName = parsedSet?.channelName.toUpperCase()
    const channelMatch = channelName ? matches.channels.get(channelName) : null

    await prisma.stagingSet.update({
      where: { id: ss.id },
      data: {
        matchedSetId: setMatch?.matchedEntityId ?? null,
        matchConfidence: setMatch?.matchConfidence ?? null,
        matchDetails: setMatch?.matchDetails ?? null,
        // Don't change user-controlled status — only update match data
        channelId: channelMatch?.matchedEntityId ?? null,
        subjectPersonId: person?.id ?? null,
      },
    })
  }
}

// ─── Compute Dependencies ───────────────────────────────────────────────────

export async function computeDependencies(batchId: string): Promise<void> {
  const items = await prisma.importItem.findMany({
    where: { batchId },
    select: {
      id: true,
      type: true,
      status: true,
      data: true,
      dependsOn: true,
      matchedEntityId: true,
    },
  })

  // Build a lookup of logical keys → whether they're resolved
  // A dependency is resolved if:
  // 1. The corresponding import item is MATCHED or IMPORTED, OR
  // 2. The entity already exists in the DB (matchedEntityId is set)
  const resolved = new Set<string>()

  for (const item of items) {
    const data = item.data as Record<string, unknown>
    let key: string | null = null

    switch (item.type) {
      case 'LABEL':
        key = `LABEL:${(data.name as string).toUpperCase()}`
        break
      case 'CHANNEL':
        key = `CHANNEL:${(data.name as string).toUpperCase()}`
        break
      case 'PERSON':
        key = `PERSON:${(data as Record<string, unknown>).icgId as string}`
        break
      case 'CO_MODEL':
        key = `CO_MODEL:${data.icgId as string}`
        break
    }

    if (key && (item.status === 'MATCHED' || item.status === 'IMPORTED' || item.matchedEntityId)) {
      resolved.add(key)
    }
  }

  // Update blocked status for items with unresolved dependencies
  for (const item of items) {
    if (item.status === 'IMPORTED' || item.status === 'SKIPPED') continue
    if (item.dependsOn.length === 0) continue

    const unresolvedDeps = item.dependsOn.filter((dep) => !resolved.has(dep))

    if (unresolvedDeps.length > 0 && item.status !== 'MATCHED') {
      await prisma.importItem.update({
        where: { id: item.id },
        data: {
          status: 'BLOCKED',
          blockedReason: `Waiting for: ${unresolvedDeps.join(', ')}`,
        },
      })
    } else if (unresolvedDeps.length > 0 && item.status === 'MATCHED') {
      // MATCHED items keep their status but update the blocked reason for display
      await prisma.importItem.update({
        where: { id: item.id },
        data: {
          blockedReason: `Waiting for: ${unresolvedDeps.join(', ')}`,
        },
      })
    } else if (unresolvedDeps.length === 0 && (item.status === 'BLOCKED' || item.status === 'MATCHED')) {
      // Unblock — clear stale blocked reason; unblock BLOCKED items to NEW
      await prisma.importItem.update({
        where: { id: item.id },
        data: {
          status: item.status === 'BLOCKED' ? 'NEW' : item.status,
          blockedReason: null,
        },
      })
    }
  }
}

// ─── Item Operations ────────────────────────────────────────────────────────

export async function updateItemStatus(
  itemId: string,
  status: ImportItemStatus,
  editedData?: Record<string, unknown>,
): Promise<ImportItem> {
  return prisma.importItem.update({
    where: { id: itemId },
    data: {
      status,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json field
      ...(editedData !== undefined ? { editedData: editedData as any } : {}),
    },
  })
}

export async function updateItemData(
  itemId: string,
  editedData: Record<string, unknown>,
): Promise<ImportItem> {
  return prisma.importItem.update({
    where: { id: itemId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma Json field
    data: { editedData: editedData as any },
  })
}

export async function markItemImported(
  itemId: string,
  matchedEntityId: string,
): Promise<ImportItem> {
  return prisma.importItem.update({
    where: { id: itemId },
    data: {
      status: 'IMPORTED',
      matchedEntityId,
    },
  })
}

// ─── Batch Operations ───────────────────────────────────────────────────────

export async function getBatch(batchId: string): Promise<ImportBatchWithItems> {
  return prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

export async function getAllBatches(): Promise<ImportBatchSummary[]> {
  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        select: { status: true },
      },
    },
  })

  return batches.map((b) => {
    const counts: Record<string, number> = {}
    for (const item of b.items) {
      counts[item.status] = (counts[item.status] || 0) + 1
    }

    return {
      id: b.id,
      filename: b.filename,
      subjectName: b.subjectName,
      subjectIcgId: b.subjectIcgId,
      status: b.status,
      extractionDate: b.extractionDate,
      createdAt: b.createdAt,
      itemCounts: counts as Record<ImportItemStatus, number>,
      totalItems: b.items.length,
    }
  })
}

export async function deleteBatch(batchId: string): Promise<void> {
  await prisma.importBatch.delete({ where: { id: batchId } })
}

// ─── Import Queue ───────────────────────────────────────────────────────────

export function getImportQueue(items: ImportItem[]): ImportItem[] {
  // Return items that are ready to import (NEW or QUEUED), sorted by dependency tier
  return items
    .filter((item) => item.status === 'NEW' || item.status === 'QUEUED')
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function getItemsByType(
  items: ImportItem[],
  type: ImportItemType,
): ImportItem[] {
  return items.filter((item) => item.type === type)
}

export function getStatusCounts(items: ImportItem[]): Record<ImportItemStatus, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    counts[item.status] = (counts[item.status] || 0) + 1
  }
  return counts as Record<ImportItemStatus, number>
}
