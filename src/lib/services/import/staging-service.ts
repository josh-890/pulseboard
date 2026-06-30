/**
 * Staging service — orchestrates the import pipeline.
 *
 * Creates batches from parsed files, manages item states,
 * refreshes DB matches dynamically, and computes dependencies.
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import type { ImportBatch, ImportItem, ImportItemStatus, ImportItemType, StagingSetStatus } from '@/generated/prisma/client'
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
import { runMatchingForPerson } from './cover-basket-service'
import { buildImportItemDecisions } from './build-decisions'
import { isEmptyDiff, type ImportItemDecisions } from './diff'
import { resolvePlatformFromUrl } from '@/lib/services/scrape-source-service'

/**
 * Find an existing staging set that is a *probable* duplicate of an incoming one:
 * same channel + release date + **same SetType** (`isVideo`), but a different
 * externalId. The isVideo match is essential — a photo and a video set of one
 * session share a channel/date/title but are split **siblings**, never duplicates
 * (the user's case A: same import row → siblings share externalId; case B: two
 * distinct import rows, different externalIds, one photo one video). Scoping by
 * type stops those false "POSSIBLE DUP" warnings.
 */
async function findProbableStagingDuplicate(
  channelId: string,
  releaseDate: Date,
  externalId: string | null,
  isVideo: boolean,
  titleNorm: string,
): Promise<{ id: string; status: StagingSetStatus } | null> {
  if (!titleNorm) return null
  return prisma.stagingSet.findFirst({
    where: {
      channelId,
      releaseDate,
      isVideo,
      titleNorm,
      ...(externalId ? { externalId: { not: externalId } } : {}),
    },
    select: { id: true, status: true },
  })
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportBatchWithItems = ImportBatch & {
  items: ImportItem[]
}

/**
 * Item types that represent **human-actionable** import work (the person record
 * and its dependent details). Completeness is measured over these only.
 */
export const REVIEWABLE_ITEM_TYPES: ImportItemType[] = [
  'PERSON',
  'PERSON_ALIAS',
  'DIGITAL_IDENTITY',
  'CHANNEL',
  'LABEL',
]

/**
 * Item types that are **auto-processed at upload time** and never transition to a
 * terminal `ImportItem.status`: SET → staging sets (`createStagingSetsForBatch`),
 * CO_MODEL → Contacts/ClaimedCollaboration (`autoImportBatchCoModels`), CREDIT →
 * session credits. They must NOT count toward batch completeness — surfacing them in
 * the denominator is exactly what made the old progress bar unable to reach 100%.
 */
export const AUTO_FLOW_ITEM_TYPES: ImportItemType[] = ['SET', 'CO_MODEL', 'CREDIT']

/** Reviewable-item statuses that still need the user's attention. */
const REVIEWABLE_PENDING_STATUSES: ImportItemStatus[] = [
  'NEW',
  'PROBABLE',
  'PENDING_ATTRIBUTE_REVIEW',
  'READY_TO_IMPORT',
  'QUEUED',
  'IMPORTING',
]

/** Reviewable-item statuses that are settled (imported, skipped, or a matched no-op). */
const REVIEWABLE_DONE_STATUSES: ImportItemStatus[] = ['IMPORTED', 'SKIPPED', 'MATCHED']

/** The honest, user-facing state of an import batch. */
export type BatchState = 'NEEDS_REVIEW' | 'DONE' | 'BLOCKED' | 'FAILED'

/**
 * Derive a batch's state from its reviewable-item tallies. Pure + exported so the
 * index list, the per-person grouping (Phase 2), and unit tests share one source of
 * truth. Auto-flow items (sets/co-models/credits) are intentionally not considered.
 */
export function deriveBatchState(input: {
  batchStatus: ImportBatch['status']
  reviewablePending: number
  blocked: number
}): BatchState {
  if (input.batchStatus === 'FAILED') return 'FAILED'
  if (input.reviewablePending > 0) return 'NEEDS_REVIEW'
  if (input.blocked > 0) return 'BLOCKED'
  return 'DONE'
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
  // Honest completeness — reviewable items only (see REVIEWABLE_ITEM_TYPES).
  reviewableTotal: number
  reviewableDone: number
  reviewablePending: number
  blocked: number
  state: BatchState
  // Informational auto-flow counts (chips, never gate completeness).
  setStagedCount: number
  coModelCount: number
  creditCount: number
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
    decisions?: ImportItemDecisions
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
  // ADR-0009: when the matcher finds an exact ICG-ID match (confidence=1.0)
  // we have a re-import. Compute the diff between the import file and the
  // matched person's current state. If there are decisions to make, gate
  // execution behind PENDING_ATTRIBUTE_REVIEW; if the file is identical to
  // the DB (empty diff), the existing MATCHED status keeps today's silent
  // skip semantics.
  let personDecisions: ImportItemDecisions | undefined
  let personStatus: ImportItemStatus
  if (personMatch.matchedEntityId && personMatch.matchConfidence === 1.0) {
    personDecisions = await buildImportItemDecisions(prisma, personMatch.matchedEntityId, parsed.person)
    personStatus = isEmptyDiff(personDecisions) ? 'MATCHED' : 'PENDING_ATTRIBUTE_REVIEW'
  } else if (personMatch.matchedEntityId) {
    personStatus = 'PROBABLE'
  } else {
    personStatus = 'NEW'
  }

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
    decisions: personDecisions,
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
    const platform = await resolvePlatformFromUrl(parsed.person.sourceUrl)
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

  // Re-run cover basket matching for any previously-unmatched basket items now
  // that new staging sets exist for this person (fire-and-forget, non-blocking)
  prisma.person.findFirst({ where: { icgId: parsed.person.icgId }, select: { id: true } })
    .then((person) => { if (person) return runMatchingForPerson(person.id) })
    .catch(() => undefined)

  // Re-fetch with updated statuses
  return prisma.importBatch.findUniqueOrThrow({
    where: { id: batch.id },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

// ─── Create StagingSet Records ──────────────────────────────────────────────

export type StagingIngestSummary = {
  created: number
  skipped: number       // omitted — exact production match, nothing to review
  duplicated: number    // added but marked isDuplicate (already in staging for this person)
  suggestedDate: number // created with releaseDateSuggestion extracted from title
  noDate: number        // created with neither releaseDate nor suggestion
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
    duplicated: 0,
    suggestedDate: 0,
    noDate: 0,
    byMatchType: { none: 0, exact: 0, probable: 0 },
  }

  // Clean up orphaned duplicate groups: a group whose only non-SKIPPED member is
  // the last survivor no longer needs a duplicateGroupId (the "duplicate" is gone).
  // This happens when a sibling was resolved/skipped in a previous session and the
  // surviving canonical entry was left with a stale groupId showing an orange badge.
  {
    const activeWithGroup = await prisma.stagingSet.findMany({
      where: { duplicateGroupId: { not: null }, status: { not: 'SKIPPED' } },
      select: { id: true, duplicateGroupId: true },
    })
    const groupMembers = new Map<string, string[]>()
    for (const entry of activeWithGroup) {
      const gid = entry.duplicateGroupId!
      groupMembers.set(gid, [...(groupMembers.get(gid) ?? []), entry.id])
    }
    const orphanedIds = [...groupMembers.values()]
      .filter((ids) => ids.length === 1)
      .map((ids) => ids[0])
    if (orphanedIds.length > 0) {
      await prisma.stagingSet.updateMany({
        where: { id: { in: orphanedIds } },
        data: { duplicateGroupId: null, isDuplicate: false },
      })
    }
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

    const setMatch = matches.sets.get(set.externalId)

    // Omit if already in production with exact match — nothing left to review
    if (setMatch?.matchedEntityId && setMatch.matchConfidence === 1.0) {
      summary.skipped++
      continue
    }

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

    // Parse release date — guard against Invalid Date (e.g. 0000-00-00 slipping through)
    const parsedDate = set.date ? new Date(set.date) : null
    const safeDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null

    // Parse release date precision
    let releaseDatePrecision: 'UNKNOWN' | 'YEAR' | 'MONTH' | 'DAY' = 'UNKNOWN'
    if (safeDate && set.date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(set.date)) releaseDatePrecision = 'DAY'
      else if (/^\d{4}-\d{2}$/.test(set.date)) releaseDatePrecision = 'MONTH'
      else if (/^\d{4}$/.test(set.date)) releaseDatePrecision = 'YEAR'
    }

    // If the same externalId already exists in staging (any person) → omit entirely.
    // A set is a set regardless of which person's import file referenced it.
    if (set.externalId) {
      const existingStaging = await prisma.stagingSet.findFirst({
        where: { externalId: set.externalId },
        select: { id: true },
      })
      if (existingStaging) {
        summary.skipped++
        continue
      }
    }

    // Probable staging duplicate: same channel + release date + SAME SetType +
    // SAME normalized title (different externalId). Catches the same set appearing
    // in two import files (a re-scrape with a new external id). Title is required
    // because a channel routinely releases several *different* sets on one date —
    // channel+date+type alone is not a duplicate signal. Scoped by isVideo so
    // photo↔video split siblings never flag each other.
    // Exception: if a same-type match is already SKIPPED (user resolved it), omit.
    const titleNorm = normalizeForSearch(set.title)
    const needsSplit = set.isVideo && (set.imageCount ?? 0) > 0

    async function probableDupStatus(isVid: boolean): Promise<'skip' | 'dup' | 'none'> {
      if (!channelId || !safeDate || !titleNorm) return 'none'
      const existing = await findProbableStagingDuplicate(channelId, safeDate, set.externalId || null, isVid, titleNorm)
      if (!existing) return 'none'
      if (existing.status === 'SKIPPED') return 'skip'
      // Flag the existing entry too — both sides must appear in the duplicates filter.
      await prisma.stagingSet.update({ where: { id: existing.id }, data: { isDuplicate: true } })
      return 'dup'
    }

    let photoDup = false
    let videoDup = false
    if (needsSplit) {
      photoDup = (await probableDupStatus(false)) === 'dup'
      videoDup = (await probableDupStatus(true)) === 'dup'
      if (photoDup || videoDup) summary.duplicated++
    } else {
      const status = await probableDupStatus(set.isVideo)
      if (status === 'skip') {
        summary.skipped++
        continue
      }
      if (status === 'dup') {
        summary.duplicated++
        if (set.isVideo) videoDup = true
        else photoDup = true
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

    // Fields shared by both sides of a split (or by the single staging set when no split)
    const commonData = {
      title: set.title,
      titleNorm: normalizeForSearch(set.title),
      externalId: set.externalId || null,
      channelName: set.channelName,
      channelId,
      releaseDate: safeDate,
      releaseDatePrecision,
      releaseDateSuggestion: set.suggestedDate ?? null,
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
      status: 'PENDING' as const,
    }

    // When the import entry has BOTH Video:True AND Imagenumber>0 the set genuinely has
    // a photo gallery component AND a video component. Create two staging sets so each
    // can be matched, archived, and promoted to the correct Set type independently.
    // Each carries its own type-scoped duplicate flag (photoDup / videoDup).
    if (needsSplit) {
      // Photo staging set — keeps the image count, no sibling yet
      const photoStaging = await prisma.stagingSet.create({
        data: { ...commonData, isDuplicate: photoDup, isVideo: false, imageCount: set.imageCount },
      })
      // Video staging set — no image count, points to photo sibling; inherits any video match
      await prisma.stagingSet.create({
        data: {
          ...commonData,
          isDuplicate: videoDup,
          isVideo: true,
          imageCount: null,
          siblingId: photoStaging.id,
          matchedSetId: setMatch?.matchedEntityId ?? null,
          matchConfidence: setMatch?.matchConfidence ?? null,
          matchDetails: setMatch?.matchDetails ?? null,
        },
      })
      summary.created += 2
    } else {
      await prisma.stagingSet.create({
        data: {
          ...commonData,
          isDuplicate: set.isVideo ? videoDup : photoDup,
          isVideo: set.isVideo,
          imageCount: set.imageCount,
          matchedSetId: setMatch?.matchedEntityId ?? null,
          matchConfidence: setMatch?.matchConfidence ?? null,
          matchDetails: setMatch?.matchDetails ?? null,
        },
      })
      summary.created++
    }
    if (set.suggestedDate) summary.suggestedDate++
    else if (!safeDate) summary.noDate++
  }

  // Auto-populate Contacts (ADR-0022) from staged-set participants who aren't a
  // curated Person yet — so the Contacts register stays current from sets, not
  // just import co-models. ICG-ID keyed (the canonical, reconcilable identity);
  // name-only participants are skipped, and a malformed/HTML-polluted icgId is
  // rejected by the ICG-ID shape guard. No claim is created here — staged
  // co-occurrence is derived, not stored.
  const ICG_ID_RE = /^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$/
  const contactByIcg = new Map<string, string>() // icgId → display name (first seen)
  for (const set of parsedSets) {
    for (const m of set.modelsList) {
      if (!m.icgId || !ICG_ID_RE.test(m.icgId)) continue
      if (personByIcgId.has(m.icgId)) continue // already a curated Person
      if (!contactByIcg.has(m.icgId)) contactByIcg.set(m.icgId, m.name || m.icgId)
    }
  }
  for (const [icgId, name] of contactByIcg) {
    await prisma.contact.upsert({
      where: { icgId },
      create: { icgId, name, nameNorm: normalizeForSearch(name), source: 'import' },
      update: { name, nameNorm: normalizeForSearch(name) },
    })
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

  // If the person's icgId was corrected after import, rawContent still has the old wrong ID
  // and matchAllEntities will fail to find the person by exact icgId.
  // Fall back to batch.subjectIcgId (which is kept in sync with Person.icgId) so the
  // PERSON item resolves correctly and SET dependency checks don't break.
  if (!matches.person.matchedEntityId && batch.subjectIcgId !== parsed.person.icgId) {
    const correctedPerson = await prisma.person.findUnique({
      where: { icgId: batch.subjectIcgId },
      select: { id: true, aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
    })
    if (correctedPerson) {
      matches.person = {
        matchedEntityId: correctedPerson.id,
        matchConfidence: 1.0,
        matchDetails: `ICG-ID corrected: batch.subjectIcgId=${batch.subjectIcgId}`,
        existingName: correctedPerson.aliases[0]?.name,
      }
    }
  }

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
      // ADR-0009: PERSON items with confidence=1.0 enter the review gate.
      // Other types keep today's MATCHED/PROBABLE/NEW transitions.
      let newStatus: ImportItemStatus
      let newDecisions: ImportItemDecisions | null = null
      if (item.type === 'PERSON' && newMatch.matchedEntityId && newMatch.matchConfidence === 1.0) {
        newDecisions = await buildImportItemDecisions(
          prisma,
          newMatch.matchedEntityId,
          data as Parameters<typeof buildImportItemDecisions>[2],
          item.batchId,
        )
        // Preserve existing in-flight decisions if the user has already
        // started reviewing (don't blow away their work on every page load).
        if (item.status === 'PENDING_ATTRIBUTE_REVIEW' && item.decisions) {
          newDecisions = item.decisions as ImportItemDecisions
        }
        newStatus = isEmptyDiff(newDecisions) ? 'MATCHED' : 'PENDING_ATTRIBUTE_REVIEW'
      } else {
        newStatus =
          newMatch.matchedEntityId
            ? newMatch.matchConfidence === 1.0
              ? 'MATCHED'
              : 'PROBABLE'
            : item.status === 'BLOCKED'
              ? 'BLOCKED'
              : 'NEW'
      }

      const updateData: Prisma.ImportItemUpdateInput = {
        status: newStatus,
        matchedEntityId: newMatch.matchedEntityId,
        matchConfidence: newMatch.matchConfidence,
        matchDetails: newMatch.matchDetails,
      }
      if (item.type === 'PERSON') {
        // Prisma's nullable JSON column needs JsonNull to explicitly null,
        // or a plain JS object value otherwise.
        updateData.decisions =
          newDecisions === null
            ? Prisma.JsonNull
            : (newDecisions as unknown as Prisma.InputJsonValue)
      }
      await prisma.importItem.update({ where: { id: item.id }, data: updateData })
    }
  }

  // Recompute dependencies
  await computeDependencies(batchId)

  // Refresh StagingSet records: update match data, resolve channelId/subjectPersonId
  await refreshStagingSets(batchId, parsed, matches, batch.subjectIcgId)

  return prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
  })
}

async function refreshStagingSets(
  batchId: string,
  parsed: ReturnType<typeof parseImportFile>,
  matches: Awaited<ReturnType<typeof matchAllEntities>>,
  subjectIcgId?: string,
): Promise<void> {
  const stagingSets = await prisma.stagingSet.findMany({
    where: { importBatchId: batchId },
    select: { id: true, externalId: true, status: true },
  })

  // Use the batch's subjectIcgId (kept in sync with Person.icgId on correction) in preference
  // to parsed.person.icgId (from immutable rawContent, may still hold the old wrong ID).
  const resolvedIcgId = subjectIcgId ?? parsed.person.icgId
  const person = await prisma.person.findUnique({
    where: { icgId: resolvedIcgId },
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

/**
 * ADR-0009: persist the user's per-row Accept/Decline decisions on a
 * PERSON ImportItem. When every row in the decisions structure has been
 * resolved, the item auto-transitions PENDING_ATTRIBUTE_REVIEW →
 * READY_TO_IMPORT so the "Import" button can fire `importPerson()`.
 *
 * Phase 2: write ImportDeclineLog entries for declined alias rows in the
 * same transaction. The slice (personId × kind='alias' × this batch) is
 * rewritten on every save so the log reflects the user's *current* intent
 * for this batch — flipping a row back from Decline → Accept removes the
 * stale entry.
 */
export async function updateItemDecisions(
  itemId: string,
  decisions: ImportItemDecisions,
): Promise<ImportItem> {
  const { allDecisionsMade } = await import('./diff')
  const ready = allDecisionsMade(decisions)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.importItem.update({
      where: { id: itemId },
      data: {
        decisions: decisions as unknown as Prisma.InputJsonValue,
        ...(ready ? { status: 'READY_TO_IMPORT' as ImportItemStatus } : {}),
      },
      select: {
        id: true,
        batchId: true,
        matchedEntityId: true,
        type: true,
        status: true,
        data: true,
        editedData: true,
        rawText: true,
        sortOrder: true,
        matchConfidence: true,
        matchDetails: true,
        dependsOn: true,
        blockedReason: true,
        decisions: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Decline-log slice rewrite: only for PERSON re-imports against a
    // matched person. The slice scope is (personId, kind='alias', batchId).
    if (
      updated.type === 'PERSON' &&
      updated.matchedEntityId &&
      updated.batchId
    ) {
      await tx.importDeclineLog.deleteMany({
        where: {
          personId: updated.matchedEntityId,
          kind: 'alias',
          declinedInBatchId: updated.batchId,
        },
      })
      const declinedAliases = decisions.aliases.filter(
        (r) => r.decision === 'decline',
      )
      if (declinedAliases.length > 0) {
        await tx.importDeclineLog.createMany({
          data: declinedAliases.map((r) => ({
            personId: updated.matchedEntityId!,
            kind: 'alias',
            itemKey: r.itemKey,
            declinedInBatchId: updated.batchId,
          })),
        })
      }
    }

    return updated as unknown as ImportItem
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
        select: { status: true, type: true },
      },
      _count: { select: { stagingSets: true } },
    },
  })

  return batches.map((b) => summarizeBatch(b))
}

/**
 * Build an {@link ImportBatchSummary} from a batch row that includes its items'
 * `{ status, type }` and a `_count.stagingSets`. Shared by `getAllBatches` and the
 * Phase 2 inbox grouping.
 */
function summarizeBatch(b: {
  id: string
  filename: string
  subjectName: string
  subjectIcgId: string
  status: ImportBatch['status']
  extractionDate: Date | null
  createdAt: Date
  items: { status: ImportItemStatus; type: ImportItemType }[]
  _count: { stagingSets: number }
}): ImportBatchSummary {
  const counts: Record<string, number> = {}
  let reviewableTotal = 0
  let reviewableDone = 0
  let reviewablePending = 0
  let blocked = 0
  let coModelCount = 0
  let creditCount = 0

  for (const item of b.items) {
    counts[item.status] = (counts[item.status] || 0) + 1

    if (item.type === 'CO_MODEL') coModelCount++
    if (item.type === 'CREDIT') creditCount++

    if (REVIEWABLE_ITEM_TYPES.includes(item.type)) {
      reviewableTotal++
      if (item.status === 'BLOCKED') blocked++
      else if (REVIEWABLE_PENDING_STATUSES.includes(item.status)) reviewablePending++
      else if (REVIEWABLE_DONE_STATUSES.includes(item.status)) reviewableDone++
    }
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
    reviewableTotal,
    reviewableDone,
    reviewablePending,
    blocked,
    state: deriveBatchState({ batchStatus: b.status, reviewablePending, blocked }),
    setStagedCount: b._count.stagingSets,
    coModelCount,
    creditCount,
  }
}

export async function deleteBatch(batchId: string): Promise<void> {
  await prisma.importBatch.delete({ where: { id: batchId } })
}

// ─── Import Inbox (triage) ────────────────────────────────────────────────────

export const DONE_PAGE_SIZE = 50

export type ImportDoneSort = 'name' | 'recent'

/**
 * One person's import activity: the latest batch is the representative row; older
 * re-imports (ADR-0009 `previousBatchId` chain) are carried as `history`, newest first.
 */
export type ImportInboxGroup = {
  /** subjectIcgId (or the batch id when no ICG-ID) — stable React key. */
  key: string
  subjectName: string
  subjectIcgId: string
  state: BatchState
  /** Total number of batches imported for this person. */
  version: number
  latest: ImportBatchSummary
  /** Older batches, newest first (excludes `latest`). */
  history: ImportBatchSummary[]
}

export type ImportInbox = {
  needsReview: ImportInboxGroup[]
  done: ImportInboxGroup[]
  doneNextOffset: number | null
  doneTotal: number
  /** Total distinct persons (groups) matching the query. */
  totalGroups: number
}

function compareGroupsByName(a: ImportInboxGroup, b: ImportInboxGroup): number {
  return (
    a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: 'base' }) ||
    a.subjectIcgId.localeCompare(b.subjectIcgId)
  )
}

/**
 * Build the import triage inbox: batches grouped **per person** (by `subjectIcgId`),
 * split into an actionable `needsReview` head (always returned in full) and a
 * name-sorted, offset-paginated `done` tail. Mirrors the Contacts page's
 * priority-head + paginated-tail shape.
 *
 * `q` filters by subject name / ICG-ID at the DB level; because every batch in a
 * person's chain shares those fields, the full re-import chain is preserved for any
 * matching person.
 */
export async function getImportInbox(opts: {
  q?: string
  sort?: ImportDoneSort
  doneOffset?: number
  doneLimit?: number
} = {}): Promise<ImportInbox> {
  const { q, sort = 'name', doneOffset = 0, doneLimit = DONE_PAGE_SIZE } = opts

  const where = q
    ? {
        OR: [
          { subjectName: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { subjectIcgId: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      }
    : {}

  const batches = await prisma.importBatch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      items: { select: { status: true, type: true } },
      _count: { select: { stagingSets: true } },
    },
  })

  // Group by person; representative = most recent batch (list is already desc).
  const groups = new Map<string, ImportInboxGroup>()
  for (const b of batches) {
    const summary = summarizeBatch(b)
    const key = b.subjectIcgId || b.id
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        key,
        subjectName: summary.subjectName,
        subjectIcgId: summary.subjectIcgId,
        state: summary.state,
        version: 1,
        latest: summary,
        history: [],
      })
    } else {
      existing.version++
      existing.history.push(summary)
    }
  }

  const all = [...groups.values()]
  const needsReview = all
    .filter((g) => g.state !== 'DONE')
    .sort((a, b) => b.latest.createdAt.getTime() - a.latest.createdAt.getTime())
  const doneAll = all.filter((g) => g.state === 'DONE')
  doneAll.sort(
    sort === 'recent'
      ? (a, b) => b.latest.createdAt.getTime() - a.latest.createdAt.getTime()
      : compareGroupsByName,
  )

  const doneSlice = doneAll.slice(doneOffset, doneOffset + doneLimit)
  const nextOffset = doneOffset + doneSlice.length
  return {
    needsReview,
    done: doneSlice,
    doneNextOffset: nextOffset < doneAll.length ? nextOffset : null,
    doneTotal: doneAll.length,
    totalGroups: all.length,
  }
}

/** "Load more" page of the inbox's Done section (mirrors loadMoreContactsAction). */
export async function getImportDonePage(opts: {
  q?: string
  sort?: ImportDoneSort
  offset: number
}): Promise<{ rows: ImportInboxGroup[]; nextOffset: number | null }> {
  const inbox = await getImportInbox({
    q: opts.q,
    sort: opts.sort,
    doneOffset: opts.offset,
    doneLimit: DONE_PAGE_SIZE,
  })
  return { rows: inbox.done, nextOffset: inbox.doneNextOffset }
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
