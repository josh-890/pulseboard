/**
 * Import executor — per-entity import functions.
 *
 * Each function takes an ImportItem, validates dependencies,
 * calls the appropriate service function, and returns the created entity ID.
 */

import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import type { ImportItem, Prisma } from '@/generated/prisma/client'
import { createLabelRecord } from '@/lib/services/label-service'
import { createChannelRecord } from '@/lib/services/channel-service'
import { createPersonRecord } from '@/lib/services/person-service'
import { createAlias, linkAliasToChannels } from '@/lib/services/alias-service'
import { createDigitalIdentity } from '@/lib/services/digital-identity-service'
import { rebuildSetParticipantsFromContributions } from '@/lib/services/contribution-service'
import { recomputePersonCurrentStateStandalone } from '@/lib/services/current-state-service'
import { markItemImported, computeDependencies } from './staging-service'
import { markStagingSetPromoted } from './staging-set-service'
import { pickOwnerLabelId } from '@/lib/services/label-resolution'
import type { ParticipantStatus } from './staging-set-service'
import { parseBreastDescription, extractCupFromMeasurements, chooseNaturalCup, canonicaliseBreastCup } from './import-utils'
import { parseClaimedStats } from './parse-claimed-stats'
import { transferStagingCoverToSet } from './cover-transfer'
import { autoClusterDeltaIntoDraftEra, getBaselineEraId } from '@/lib/services/era-service'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportResult = {
  success: boolean
  entityId: string | null
  error: string | null
}

type ItemData = Record<string, unknown>

// ─── Month name → number mapping ────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
}

function monthNameToNumber(month: string): string | null {
  return MONTH_MAP[month.toLowerCase()] ?? null
}

// ─── Country name → ISO code mapping (common ones) ──────────────────────────

import { resolveNationalityToIoc } from '@/lib/constants/countries'

// ─── Resolve dependencies from batch items ──────────────────────────────────

async function resolveEntityId(
  batchId: string,
  depKey: string,
): Promise<string | null> {
  // depKey format: "TYPE:KEY" e.g. "LABEL:FEMJOY" or "PERSON:CX-82HO"
  const [type, ...keyParts] = depKey.split(':')
  const key = keyParts.join(':')

  // Find the corresponding import item
  const items = await prisma.importItem.findMany({
    where: { batchId, type: type as ImportItem['type'] },
    select: { id: true, data: true, matchedEntityId: true, status: true },
  })

  for (const item of items) {
    const data = item.data as ItemData
    let itemKey: string | null = null

    switch (type) {
      case 'LABEL':
      case 'CHANNEL':
        itemKey = (data.name as string)?.toUpperCase()
        break
      case 'PERSON':
        itemKey = (data as ItemData).icgId as string
        break
      case 'CO_MODEL':
        itemKey = data.icgId as string
        break
    }

    if (itemKey === key && item.matchedEntityId) {
      return item.matchedEntityId
    }
  }

  return null
}

// ─── Import: Label ──────────────────────────────────────────────────────────

export async function importLabel(item: ImportItem): Promise<ImportResult> {
  try {
    const data = (item.editedData ?? item.data) as ItemData
    const name = data.name as string

    // If already matched, just mark as imported
    if (item.matchedEntityId) {
      await markItemImported(item.id, item.matchedEntityId)
      return { success: true, entityId: item.matchedEntityId, error: null }
    }

    const label = await createLabelRecord({ name })
    await markItemImported(item.id, label.id)
    await computeDependencies(item.batchId)

    return { success: true, entityId: label.id, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Import: Channel ────────────────────────────────────────────────────────

export async function importChannel(item: ImportItem): Promise<ImportResult> {
  try {
    const data = (item.editedData ?? item.data) as ItemData
    const name = data.name as string

    if (item.matchedEntityId) {
      await markItemImported(item.id, item.matchedEntityId)
      return { success: true, entityId: item.matchedEntityId, error: null }
    }

    // Resolve the label dependency
    const labelId = await resolveEntityId(item.batchId, `LABEL:${name.toUpperCase()}`)
    if (!labelId) {
      return { success: false, entityId: null, error: `Label for "${name}" not found. Import the label first.` }
    }

    const channel = await createChannelRecord({ name, labelId })
    await markItemImported(item.id, channel.id)
    await computeDependencies(item.batchId)

    return { success: true, entityId: channel.id, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── ADR-0009: re-import Accept-set application ─────────────────────────────

/**
 * Apply the user-decided Accept set from an ImportItem.decisions payload
 * to an already-existing person. Called from importPerson() when the item
 * is in READY_TO_IMPORT.
 *
 * Scalar Accepts route by chosenDestination:
 *  - 'baseline'  → replace baseline ScalarDelta for the slug
 *  - 'on-date'   → autoCluster into a draft Era at the source date
 *  - 'dateless'  → file into the person's dateless draft Era
 *
 * Relation Accepts create new rows. Person column Accepts overwrite the
 * column. Decline rows are no-ops in Phase 1 (Phase 2 will log them to
 * ImportDeclineLog for future-import context).
 */
async function applyReimportDecisions(
  personId: string,
  decisions: import('./diff').ImportItemDecisions,
  batchId: string,
): Promise<void> {
  // Source date for "on-date" defaults: the batch's extractionDate if set,
  // else its createdAt (always present). Re-imports cluster around the
  // file's snapshot date, not the moment the import was run.
  const batch = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { extractionDate: true, createdAt: true },
  })
  const sourceDate = batch.extractionDate ?? batch.createdAt
  const sourcePrecision = 'DAY' as const

  // Cache slug → definitionId so we don't re-query in the loop.
  const slugs = decisions.scalars
    .filter((r) => r.decision === 'accept')
    .map((r) => r.slug)
  const defs =
    slugs.length === 0
      ? []
      : await prisma.physicalAttributeDefinition.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true },
        })
  const defBySlug = new Map(defs.map((d) => [d.slug, d.id]))

  // Process scalar Accepts.
  for (const row of decisions.scalars) {
    if (row.decision !== 'accept') continue
    const definitionId = defBySlug.get(row.slug)
    if (!definitionId) continue
    const dest = row.chosenDestination ?? row.defaultDestination
    let eraId: string
    let deltaDate: Date | null
    if (dest === 'baseline') {
      eraId = await getBaselineEraId(prisma, personId)
      deltaDate = null
      // Baseline writes replace any existing delta for this attr.
      await prisma.scalarDelta.deleteMany({
        where: { eraId, attributeDefinitionId: definitionId },
      })
    } else if (dest === 'dateless') {
      eraId = await autoClusterDeltaIntoDraftEra(prisma, personId, null, 'UNKNOWN')
      deltaDate = null
    } else {
      // 'on-date'
      eraId = await autoClusterDeltaIntoDraftEra(
        prisma,
        personId,
        sourceDate,
        sourcePrecision,
      )
      deltaDate = sourceDate
    }
    await prisma.scalarDelta.create({
      data: {
        eraId,
        attributeDefinitionId: definitionId,
        value: row.importValue,
        date: deltaDate,
        datePrecision: deltaDate ? sourcePrecision : 'UNKNOWN',
        dateSource: 'import-reimport',
        // Verbatim source string when the parsed value loses information
        // (currently only breast_size). Preserves the description across
        // re-imports so the annotation row in the grid keeps its data.
        notes: row.importNotes ?? null,
      },
    })
  }

  // Aliases — create only on Accept (Phase 1 has no decline log yet).
  for (const row of decisions.aliases) {
    if (row.decision !== 'accept') continue
    await prisma.personAlias.create({
      data: {
        personId,
        name: row.importLabel,
        nameNorm: normalizeForSearch(row.importLabel),
        isCommon: row.kind === 'common',
        isBirth: row.kind === 'birth',
      },
    })
  }

  // Person columns — overwrite the column directly on Accept (ADR-0008
  // user-verifies-at-import-time principle).
  const personUpdate: Record<string, unknown> = {}
  for (const row of decisions.personColumns) {
    if (row.decision !== 'accept') continue
    switch (row.field) {
      case 'birthdate':
        personUpdate.birthdate = new Date(row.importValue)
        break
      case 'nationality':
        personUpdate.nationality = row.importValue
        break
      case 'activeFrom':
        personUpdate.activeFrom = new Date(row.importValue)
        break
      case 'retiredAt':
        personUpdate.retiredAt = new Date(row.importValue)
        break
      case 'bio':
        personUpdate.bio = row.importValue
        break
      case 'sexAtBirth':
        personUpdate.sexAtBirth = row.importValue
        break
      case 'birthPlace':
        personUpdate.birthPlace = row.importValue
        break
    }
  }
  // Re-parse the claimed catalogue size when an updated bio is accepted, unless
  // the user has hand-edited the figures (claimedStatsUserSet) — then we leave
  // them alone so a re-import can't clobber a manual correction.
  if (typeof personUpdate.bio === 'string') {
    const cur = await prisma.person.findUnique({
      where: { id: personId },
      select: { claimedStatsUserSet: true },
    })
    if (!cur?.claimedStatsUserSet) {
      const claimed = parseClaimedStats(personUpdate.bio)
      if (claimed.photosets !== null) personUpdate.claimedPhotosets = claimed.photosets
      if (claimed.videos !== null) personUpdate.claimedVideos = claimed.videos
    }
  }

  if (Object.keys(personUpdate).length > 0) {
    await prisma.person.update({ where: { id: personId }, data: personUpdate })
  }
}

// ─── Import: Person ─────────────────────────────────────────────────────────

export async function importPerson(item: ImportItem): Promise<ImportResult> {
  try {
    const data = (item.editedData ?? item.data) as ItemData

    // Defensive guard (2026-05-26): only auto-merge into a matched person
    // when the match is canonical (confidence === 1.0 = exact ICG-ID
    // match). Anything weaker would mean we're silently merging two
    // potentially different real people.
    if (item.matchedEntityId && item.matchConfidence === 1.0) {
      // ADR-0009: matched re-import path.
      //  - PENDING_ATTRIBUTE_REVIEW → refuse; user must finish the review.
      //  - READY_TO_IMPORT → apply the user-decided Accept set.
      //  - MATCHED (empty diff) → silent skip, as before.
      if (item.status === 'PENDING_ATTRIBUTE_REVIEW') {
        return {
          success: false,
          entityId: null,
          error: 'Re-import review pending — complete the Accept/Decline decisions before importing.',
        }
      }
      if (item.status === 'READY_TO_IMPORT' && item.decisions) {
        await applyReimportDecisions(
          item.matchedEntityId,
          item.decisions as unknown as import('./diff').ImportItemDecisions,
          item.batchId,
        )
      }
      await recomputePersonCurrentStateStandalone(item.matchedEntityId)
      await markItemImported(item.id, item.matchedEntityId)
      await computeDependencies(item.batchId)
      return { success: true, entityId: item.matchedEntityId, error: null }
    }
    if (item.matchedEntityId && item.matchConfidence !== 1.0) {
      return {
        success: false,
        entityId: null,
        error: `Refusing to auto-merge: matched entity ${item.matchedEntityId} has confidence ${item.matchConfidence ?? 'null'} (only 1.0 = exact ICG-ID match is allowed). Clear the match in the UI to create a new person, or accept the match explicitly.`,
      }
    }

    // Build birthdate from month + year
    let birthdate: string | undefined
    let birthdatePrecision: 'UNKNOWN' | 'YEAR' | 'MONTH' | 'DAY' = 'UNKNOWN'
    const birthMonth = data.birthMonth as string | null
    const birthYear = data.birthYear as string | null

    if (birthYear) {
      if (birthMonth) {
        const monthNum = monthNameToNumber(birthMonth)
        if (monthNum) {
          birthdate = `${birthYear}-${monthNum}-01`
          birthdatePrecision = 'MONTH'
        } else {
          birthdate = `${birthYear}-01-01`
          birthdatePrecision = 'YEAR'
        }
      } else {
        birthdate = `${birthYear}-01-01`
        birthdatePrecision = 'YEAR'
      }
    }

    // Build activeFrom date
    let activeFrom: string | undefined
    let activeFromPrecision: 'UNKNOWN' | 'YEAR' | 'MONTH' | 'DAY' = 'UNKNOWN'
    const activeFromYear = data.activeFromYear as string | null

    if (activeFromYear) {
      activeFrom = `${activeFromYear}-01-01`
      activeFromPrecision = 'YEAR'
    }

    // Map nationality
    const nationalityRaw = data.nationality as string | null
    const nationality = nationalityRaw ? resolveNationalityToIoc(nationalityRaw) ?? undefined : undefined

    // Parse breast description
    const breastRaw = data.breastDescription as string | null
    let breastParsed: { cupSize: string | null; status: 'natural' | 'enhanced'; raw: string } | null = null
    if (breastRaw) {
      breastParsed = parseBreastDescription(breastRaw)
    }

    // Also try to extract cup from measurements (e.g. "86C-66-87")
    const measurementsRaw = data.measurements as string | null
    let cupFromMeasurements: string | null = null
    if (measurementsRaw) {
      cupFromMeasurements = extractCupFromMeasurements(measurementsRaw)
    }

    // Best cup size from any source. Used as the post-enhancement value when
    // the source signals SURGICAL.
    const cupAny = cupFromMeasurements ?? breastParsed?.cupSize ?? null
    const naturalCup = chooseNaturalCup(cupAny, breastParsed?.status ?? null)

    const hairColor = data.hairColor as string | undefined

    const person = await createPersonRecord({
      icgId: data.icgId as string,
      commonName: data.name as string,
      status: 'active',
      birthdate,
      birthdatePrecision,
      birthdateModifier: 'EXACT',
      nationality,
      currentHairColor: hairColor, // baseline hair colour ScalarDelta
      height: data.heightCm as number | undefined,
      // ADR-0008 low-stakes TEXT pass-through: raw measurements string lands
      // on the cattr-measurements baseline delta as-is, no parsing into
      // Bust/Waist/Hips numeric scalars.
      measurements: measurementsRaw ?? undefined,
      sexAtBirth: 'female' as const,
    })

    // Update additional person fields not covered by createPersonRecord.
    // Typed as Prisma.PersonUpdateInput so writes to columns that no longer
    // exist (e.g. the legacy `naturalBreastSize` / `measurements` fields
    // dropped in Phase G) fail at compile time instead of at runtime.
    const additionalUpdates: Prisma.PersonUpdateInput = {}

    if (activeFrom) {
      additionalUpdates.activeFrom = new Date(activeFrom)
      additionalUpdates.activeFromPrecision = activeFromPrecision
    }

    // retiredAt from biographies-extracted retiredYear
    const retiredYear = data.retiredYear as string | null
    if (retiredYear) {
      additionalUpdates.retiredAt = new Date(`${retiredYear}-01-01`)
      additionalUpdates.retiredAtPrecision = 'YEAR'
      additionalUpdates.status = 'inactive'
    }

    // Build bio: biography + biographies + tattoos + activities (appended as sections)
    const bioParts: string[] = []
    if (data.biography) bioParts.push(data.biography as string)
    if (data.biographies) bioParts.push(data.biographies as string)
    if (data.tattoos) bioParts.push(`Tattoos: ${data.tattoos}`)
    if (data.activities) bioParts.push(`Activities: ${data.activities}`)
    if (bioParts.length > 0) {
      const composedBio = bioParts.join('\n\n')
      additionalUpdates.bio = composedBio
      // Claimed catalogue size from the biography line ("… Y photosets, Z videos").
      // New person → claimedStatsUserSet stays false (re-imports may refresh it).
      const claimed = parseClaimedStats(composedBio)
      if (claimed.photosets !== null) additionalUpdates.claimedPhotosets = claimed.photosets
      if (claimed.videos !== null) additionalUpdates.claimedVideos = claimed.videos
    }

    if (Object.keys(additionalUpdates).length > 0) {
      await prisma.person.update({
        where: { id: person.id },
        data: additionalUpdates,
      })
    }

    // Baseline breast data → a ScalarDelta. (hair colour was set as a delta by
    // createPersonRecord via currentHairColor.) Enhanced status → an additional
    // ScalarDelta with cause=SURGICAL on a draft era (ADR-0007, Phase G Slice 5).
    //
    // Provenance preservation: when breastRaw is present we ALWAYS write a
    // baseline delta — `notes` carries the verbatim source string so it's
    // available for later reference even when no natural cup can be set
    // (enhanced status, or unparseable text). Per ADR-0008 principle 4, the
    // delta is marked isVerifiedUnknown when there is no natural cup so the
    // gap stays searchable as "natural breast size unknown".
    if (breastParsed || breastRaw) {
      const baselineEra = await prisma.era.findFirst({
        where: { personId: person.id, isBaseline: true },
        select: { id: true },
      })

      if (baselineEra) {
        await prisma.scalarDelta.deleteMany({
          where: { eraId: baselineEra.id, attributeDefinitionId: 'cattr-breast-size' },
        })
        await prisma.scalarDelta.create({
          data: {
            eraId: baselineEra.id,
            attributeDefinitionId: 'cattr-breast-size',
            value: canonicaliseBreastCup(naturalCup) ?? '',
            isVerifiedUnknown: naturalCup == null,
            notes: breastParsed?.raw ?? breastRaw,
          },
        })
      }

      if (breastParsed?.status === 'enhanced') {
        let draftEra = await prisma.era.findFirst({
          where: { personId: person.id, label: 'Imported — undated changes', isDraft: true },
        })
        draftEra ??= await prisma.era.create({
          data: { personId: person.id, label: 'Imported — undated changes', isDraft: true },
        })
        await prisma.scalarDelta.create({
          data: {
            eraId: draftEra.id,
            attributeDefinitionId: 'cattr-breast-size',
            value: canonicaliseBreastCup(cupAny) ?? '',
            // ADR-0018: imported "enhanced/fake" breasts are augmentations.
            // (No source vocabulary distinguishes reductions today.)
            cause: 'AUGMENTATION',
            datePrecision: 'UNKNOWN',
            dateSource: 'import-enhanced',
            notes: `import: "${breastParsed.raw}"`,
          },
        })
      }
    }

    await recomputePersonCurrentStateStandalone(person.id)
    await markItemImported(item.id, person.id)
    await computeDependencies(item.batchId)

    return { success: true, entityId: person.id, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Import: Person Alias ───────────────────────────────────────────────────

export async function importAlias(item: ImportItem): Promise<ImportResult> {
  try {
    const data = (item.editedData ?? item.data) as ItemData
    const name = data.name as string
    const channelName = data.channelName as string | undefined

    // Resolve person
    const personItem = await prisma.importItem.findFirst({
      where: { batchId: item.batchId, type: 'PERSON' },
      select: { matchedEntityId: true },
    })
    const personId = personItem?.matchedEntityId
    if (!personId) {
      return { success: false, entityId: null, error: 'Person not yet imported' }
    }

    // Resolve channel
    let channelId: string | null = null
    if (channelName) {
      channelId = await resolveEntityId(item.batchId, `CHANNEL:${channelName.toUpperCase()}`)
    }

    // Check if person already has an alias with this name
    const existingAlias = await prisma.personAlias.findFirst({
      where: {
        personId,
        nameNorm: normalizeForSearch(name),
      },
      select: { id: true },
    })

    if (existingAlias) {
      // Alias exists — just link to channel
      if (channelId) {
        await linkAliasToChannels(existingAlias.id, [channelId])
      }
      await markItemImported(item.id, existingAlias.id)
      return { success: true, entityId: existingAlias.id, error: null }
    }

    // Alias doesn't exist — create it with channel link
    const channelIds = channelId ? [channelId] : undefined
    const alias = await createAlias(personId, name, false, false, 'IMPORT', null, channelIds)
    await markItemImported(item.id, alias.id)

    return { success: true, entityId: alias.id, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Import: Digital Identity ───────────────────────────────────────────────

export async function importDigitalIdentity(item: ImportItem): Promise<ImportResult> {
  try {
    const data = (item.editedData ?? item.data) as ItemData

    // Resolve person
    const personItem = await prisma.importItem.findFirst({
      where: { batchId: item.batchId, type: 'PERSON' },
      select: { matchedEntityId: true },
    })
    const personId = personItem?.matchedEntityId
    if (!personId) {
      return { success: false, entityId: null, error: 'Person not yet imported' }
    }

    const platform = (data.platform as string) || 'Source'
    const url = (data.url as string) || null
    const handle = (data.handle as string) || null

    // Watchlist scan workflow: the primary scraped page is the DI whose handle is
    // the subject's ICG-ID (set in staging-service). Stamp ITS scanned-through
    // date from the batch's extraction date (= the scrape date), advancing only
    // forward so re-importing an older file never regresses freshness.
    const batch = await prisma.importBatch.findUnique({
      where: { id: item.batchId },
      select: { extractionDate: true, subjectIcgId: true },
    })
    const isPrimarySource =
      !!handle && !!batch?.subjectIcgId && handle === batch.subjectIcgId
    const scanDate = isPrimarySource ? batch?.extractionDate ?? null : null

    // Find-or-update so re-imports don't duplicate the identity (by URL when we
    // have one, else platform + handle).
    const existing = await prisma.personDigitalIdentity.findFirst({
      where: { personId, ...(url ? { url } : { platform, handle }) },
      select: { id: true, scannedThroughAt: true },
    })

    let identityId: string
    if (existing) {
      const nextScan =
        scanDate &&
        (!existing.scannedThroughAt || scanDate > existing.scannedThroughAt)
          ? scanDate
          : undefined
      await prisma.personDigitalIdentity.update({
        where: { id: existing.id },
        data: {
          ...(url ? { url } : {}),
          ...(handle ? { handle } : {}),
          ...(nextScan ? { scannedThroughAt: nextScan } : {}),
        },
      })
      identityId = existing.id
    } else {
      const identity = await createDigitalIdentity({
        personId,
        platform,
        handle: handle || undefined,
        url: url || undefined,
        status: 'active',
      })
      if (scanDate) {
        await prisma.personDigitalIdentity.update({
          where: { id: identity.id },
          data: { scannedThroughAt: scanDate },
        })
      }
      identityId = identity.id
    }

    await markItemImported(item.id, identityId)

    return { success: true, entityId: identityId, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Match validation guards (shared between importSet + promoteManualStagingSet) ─

type MatchValidationOutcome =
  | { kind: 'enrich'; matchedSetId: string; matchedTitle: string }
  | { kind: 'create-new' }
  | { kind: 'error'; error: string }

/**
 * Validates a staging set's cached `matchedSetId` against current data
 * before promotion enriches the matched Set. Three guards in order:
 *
 *   1. The matched Set still exists.
 *   2. If both sides have an externalId, they still agree (catches
 *      data-correction drift where the cache was set at a moment when
 *      externalIds collided).
 *   3. The cached match confidence is 1.0 (exact externalId match at
 *      cache time). Anything below requires explicit user confirmation —
 *      we refuse to silently merge into a fuzzy-matched Set.
 *
 * Failure modes:
 *   - Guard 1 or 2 fails → cached match is stale. Clear it on the
 *     staging row and tell the caller to take Path B (create new Set).
 *   - Guard 3 fails → match was always fuzzy. Refuse with a structured
 *     error so the UI can surface "please clear or confirm the match
 *     in the staging panel before promoting."
 *
 * Ships with the 2026-06-02 "Attached → Grecian Sirens" fix. See
 * docs/adr/0011 (forthcoming) for the design rationale.
 */
async function validateCachedMatchForPromote(
  stagingSetId: string,
  cachedMatchId: string,
  cachedConfidence: number | null,
  stagingExternalId: string | null,
): Promise<MatchValidationOutcome> {
  const matched = await prisma.set.findUnique({
    where: { id: cachedMatchId },
    select: { id: true, externalId: true, title: true },
  })

  // Guard 1: matched Set still exists
  if (!matched) {
    await prisma.stagingSet.update({
      where: { id: stagingSetId },
      data: { matchedSetId: null, matchConfidence: null, matchDetails: null },
    })
    return { kind: 'create-new' }
  }

  // Guard 2: externalId still agrees (when both sides have one)
  if (stagingExternalId && matched.externalId && stagingExternalId !== matched.externalId) {
    await prisma.stagingSet.update({
      where: { id: stagingSetId },
      data: { matchedSetId: null, matchConfidence: null, matchDetails: null },
    })
    return { kind: 'create-new' }
  }

  // Guard 3: confidence must be 1.0 (exact). Anything fuzzy requires
  // explicit user resolution — fail loud.
  if (cachedConfidence !== null && cachedConfidence < 1.0) {
    return {
      kind: 'error',
      error:
        `Refusing to merge into existing Set "${matched.title}" — match confidence is ${cachedConfidence.toFixed(2)} (not exact). ` +
        `Please confirm the match or clear it in the staging panel before promoting.`,
    }
  }

  return { kind: 'enrich', matchedSetId: matched.id, matchedTitle: matched.title }
}

// ─── Import: Set ────────────────────────────────────────────────────────────

export async function importSet(item: ImportItem): Promise<ImportResult> {
  try {
    // Load the linked StagingSet for richer data
    const stagingSet = await prisma.stagingSet.findFirst({
      where: { importItemId: item.id },
    })

    // Fall back to ImportItem data if no StagingSet (shouldn't happen for new batches)
    const data = stagingSet
      ? {
          title: stagingSet.title,
          channelName: stagingSet.channelName,
          isVideo: stagingSet.isVideo,
          date: stagingSet.releaseDate?.toISOString().split('T')[0] ?? null,
          releaseDatePrecision: stagingSet.releaseDatePrecision,
          description: stagingSet.description,
          imageCount: stagingSet.imageCount,
          externalId: stagingSet.externalId,
          artist: stagingSet.artist,
          modelsList: stagingSet.participants as Array<{ name: string; icgId: string; url: string }> | null,
        }
      : (item.editedData ?? item.data) as ItemData

    // Path A: Enrich existing set (matched by externalId or user-confirmed).
    // Three guards (validateCachedMatchForPromote) prevent the
    // "Attached → Grecian Sirens" bug class: stale-match, externalId
    // drift, fuzzy-confidence merge. See helper above for details.
    const cachedMatchId = stagingSet?.matchedSetId ?? item.matchedEntityId
    const cachedConfidence = stagingSet?.matchConfidence ?? null
    if (cachedMatchId && stagingSet) {
      const verdict = await validateCachedMatchForPromote(
        stagingSet.id,
        cachedMatchId,
        cachedConfidence,
        stagingSet.externalId,
      )
      if (verdict.kind === 'error') {
        return { success: false, entityId: null, error: verdict.error }
      }
      if (verdict.kind === 'enrich') {
        const enrichResult = await enrichExistingSet(item, verdict.matchedSetId, data)
        await markStagingSetPromoted(stagingSet.id, verdict.matchedSetId)
        if (stagingSet.coverImageUrl) {
          transferStagingCoverToSet(stagingSet.coverImageUrl, verdict.matchedSetId).catch((err) =>
            console.error('Cover transfer failed (enrich):', err),
          )
        }
        return enrichResult
      }
      // verdict.kind === 'create-new' → fall through to Path B below
    } else if (cachedMatchId && !stagingSet) {
      // No staging set wrapper (older import-only path). Conservative:
      // require exact match — if `item.matchedEntityId` was the source,
      // we don't have a staging row to validate against, so just enrich
      // (this branch predates the staging-set workflow and only fires
      // for legacy ImportItem-only imports).
      const enrichResult = await enrichExistingSet(item, cachedMatchId, data)
      return enrichResult
    }

    // Path B: Create new set
    const createResult = await createNewSet(item, data)
    if (stagingSet && createResult.entityId) {
      await markStagingSetPromoted(stagingSet.id, createResult.entityId)
      // Copy media queue fields from staging set to promoted set
      // (ArchiveLinks are transferred atomically by markStagingSetPromoted)
      if (stagingSet.mediaPriority || stagingSet.mediaQueueAt) {
        await prisma.set.update({
          where: { id: createResult.entityId },
          data: {
            mediaPriority: stagingSet.mediaPriority,
            mediaQueueAt: stagingSet.mediaQueueAt,
          },
        })
      }
      // Transfer cover image (fire-and-forget, non-critical)
      if (stagingSet.coverImageUrl) {
        transferStagingCoverToSet(stagingSet.coverImageUrl, createResult.entityId).catch((err) =>
          console.error('Cover transfer failed (create):', err),
        )
      }
    }
    return createResult
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

/** Path A: Enrich an existing set — add participants, credits, fill empty fields */
async function enrichExistingSet(
  item: ImportItem,
  setId: string,
  data: ItemData | Record<string, unknown>,
): Promise<ImportResult> {
  try {
    await prisma.$transaction(async (tx) => {
      // Find the primary session for this set
      const setSession = await tx.setSession.findFirst({
        where: { setId, isPrimary: true },
        select: { sessionId: true },
      })
      if (!setSession) return

      const sessionId = setSession.sessionId
      const modelRole = await tx.contributionRoleDefinition.findFirst({
        where: { slug: 'model' },
        select: { id: true },
      })
      if (!modelRole) return

      // Add subject person as participant
      const personItem = await tx.importItem.findFirst({
        where: { batchId: item.batchId, type: 'PERSON' },
        select: { matchedEntityId: true },
      })
      if (personItem?.matchedEntityId) {
        await tx.sessionContribution.upsert({
          where: {
            sessionId_personId_roleDefinitionId: {
              sessionId,
              personId: personItem.matchedEntityId,
              roleDefinitionId: modelRole.id,
            },
          },
          update: {},
          create: {
            sessionId,
            personId: personItem.matchedEntityId,
            roleDefinitionId: modelRole.id,
            confidence: 'CONFIRMED',
            confidenceSource: 'CREDIT_MATCH',
          },
        })

        // Create resolved credit for subject person (if not already present)
        const subjectPerson = await tx.person.findUnique({
          where: { id: personItem.matchedEntityId },
          select: { aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
        })
        const subjectName = subjectPerson?.aliases[0]?.name
        if (subjectName) {
          const existingSubjectCredit = await tx.setCreditRaw.findFirst({
            where: { setId, resolvedPersonId: personItem.matchedEntityId },
            select: { id: true },
          })
          if (!existingSubjectCredit) {
            await tx.setCreditRaw.create({
              data: {
                setId,
                rawName: subjectName,
                nameNorm: normalizeForSearch(subjectName),
                roleDefinitionId: modelRole.id,
                resolutionStatus: 'RESOLVED',
                resolvedPersonId: personItem.matchedEntityId,
              },
            })
          }
        }
      }

      // Add co-model contributions
      const modelsList = (data.modelsList ?? (data as ItemData).modelsList) as Array<{ name: string; icgId: string; url: string }> | null
      if (modelsList) {
        const personIcgId = await getSubjectIcgId(item.batchId)
        for (const model of modelsList) {
          if (model.icgId === personIcgId) continue
          const coModelPerson = await tx.person.findUnique({
            where: { icgId: model.icgId },
            select: { id: true },
          })
          if (!coModelPerson) continue

          await tx.sessionContribution.upsert({
            where: {
              sessionId_personId_roleDefinitionId: {
                sessionId,
                personId: coModelPerson.id,
                roleDefinitionId: modelRole.id,
              },
            },
            update: {},
            create: {
              sessionId,
              personId: coModelPerson.id,
              roleDefinitionId: modelRole.id,
              confidence: 'CONFIRMED',
              confidenceSource: 'CREDIT_MATCH',
            },
          })

          // Create resolved credit for co-model (if not already present)
          const existingCoCredit = await tx.setCreditRaw.findFirst({
            where: { setId, resolvedPersonId: coModelPerson.id },
            select: { id: true },
          })
          if (!existingCoCredit) {
            await tx.setCreditRaw.create({
              data: {
                setId,
                rawName: model.name,
                nameNorm: normalizeForSearch(model.name),
                roleDefinitionId: modelRole.id,
                resolutionStatus: 'RESOLVED',
                resolvedPersonId: coModelPerson.id,
              },
            })
          }
        }
      }

      // Add artist credit if not already present
      const artist = data.artist as string | null
      if (artist) {
        const existingCredit = await tx.setCreditRaw.findFirst({
          where: { setId, nameNorm: normalizeForSearch(artist) },
          select: { id: true },
        })
        if (!existingCredit) {
          await tx.setCreditRaw.create({
            data: {
              setId,
              rawName: artist,
              nameNorm: normalizeForSearch(artist),
              resolutionStatus: 'UNRESOLVED',
            },
          })
        }
      }

      // Fill empty fields on the Set
      const existingSet = await tx.set.findUnique({
        where: { id: setId },
        select: { description: true, imageCount: true, externalId: true },
      })
      if (existingSet) {
        const updates: Record<string, unknown> = {}
        if (!existingSet.description && data.description) updates.description = data.description
        if (existingSet.imageCount == null && data.imageCount != null) updates.imageCount = data.imageCount
        // Backfill externalId when the matched Set has none. createNewSet (Path B)
        // sets it on create, but this enrich path previously skipped it, so a
        // confirmed merge silently dropped the external ID the comparison view
        // promised ("will add … External-ID"). externalId is @unique — only claim
        // it if no other Set holds it, so a stray duplicate can't abort the whole
        // promote transaction.
        const incomingExternalId = (data.externalId as string | null | undefined) ?? null
        if (!existingSet.externalId && incomingExternalId) {
          const clash = await tx.set.findFirst({
            where: { externalId: incomingExternalId, id: { not: setId } },
            select: { id: true },
          })
          if (!clash) updates.externalId = incomingExternalId
        }
        if (Object.keys(updates).length > 0) {
          await tx.set.update({ where: { id: setId }, data: updates })
        }
      }

      // Rebuild SetParticipant cache from SessionContribution
      await rebuildSetParticipantsFromContributions(tx, setId)
    })

    await markItemImported(item.id, setId)
    await computeDependencies(item.batchId)
    return { success: true, entityId: setId, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

/** Path B: Create a brand new Set + Session from import data */
async function createNewSet(
  item: ImportItem,
  data: ItemData | Record<string, unknown>,
): Promise<ImportResult> {
  try {
    const channelName = (data.channelName as string).toUpperCase()
    const channelId = await resolveEntityId(item.batchId, `CHANNEL:${channelName}`)
    if (!channelId) {
      return { success: false, entityId: null, error: `Channel "${data.channelName}" not yet imported` }
    }

    const isVideo = data.isVideo as boolean
    const dateStr = data.date as string | null
    let releaseDatePrecision: 'UNKNOWN' | 'YEAR' | 'MONTH' | 'DAY' = 'UNKNOWN'
    if (dateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) releaseDatePrecision = 'DAY'
      else if (/^\d{4}-\d{2}$/.test(dateStr)) releaseDatePrecision = 'MONTH'
      else if (/^\d{4}$/.test(dateStr)) releaseDatePrecision = 'YEAR'
    }

    const result = await prisma.$transaction(async (tx) => {
      // Owning label: Channel.labelId FK is authoritative (ADR-0020 Phase 2);
      // fall back to the highest-confidence map only when the FK is unset
      // (pre-dual-write channels). Fallback removed in Phase 5.
      const channelRow = await tx.channel.findUnique({
        where: { id: channelId },
        select: { labelId: true },
      })
      let ownerLabelId = channelRow?.labelId ?? undefined
      if (!ownerLabelId) {
        const channelMaps = await tx.channelLabelMap.findMany({
          where: { channelId },
          select: { labelId: true, confidence: true },
        })
        ownerLabelId = pickOwnerLabelId(channelMaps)
      }

      const title = data.title as string
      const session = await tx.session.create({
        data: {
          name: title,
          nameNorm: normalizeForSearch(title),
          status: 'DRAFT',
          date: dateStr ? new Date(dateStr) : undefined,
          datePrecision: releaseDatePrecision,
          labelId: ownerLabelId,
        },
      })

      const set = await tx.set.create({
        data: {
          type: isVideo ? 'video' : 'photo',
          title,
          titleNorm: normalizeForSearch(title),
          channelId,
          description: data.description as string | undefined,
          releaseDate: dateStr ? new Date(dateStr) : undefined,
          releaseDatePrecision,
          imageCount: data.imageCount as number | null,
          externalId: data.externalId as string | undefined,
        },
      })

      await tx.setSession.create({
        data: { setId: set.id, sessionId: session.id, isPrimary: true },
      })

      // Artist credit
      const artist = data.artist as string | null
      if (artist) {
        await tx.setCreditRaw.create({
          data: {
            setId: set.id,
            rawName: artist,
            nameNorm: normalizeForSearch(artist),
            resolutionStatus: 'UNRESOLVED',
          },
        })
      }

      // Subject person contribution
      const personItem = await tx.importItem.findFirst({
        where: { batchId: item.batchId, type: 'PERSON' },
        select: { matchedEntityId: true },
      })

      const modelRole = await tx.contributionRoleDefinition.findFirst({
        where: { slug: 'model' },
        select: { id: true },
      })

      if (personItem?.matchedEntityId && modelRole) {
        await tx.sessionContribution.create({
          data: {
            sessionId: session.id,
            personId: personItem.matchedEntityId,
            roleDefinitionId: modelRole.id,
            confidence: 'CONFIRMED',
            confidenceSource: 'CREDIT_MATCH',
          },
        })

        // Create resolved credit for subject person
        const subjectPerson = await tx.person.findUnique({
          where: { id: personItem.matchedEntityId },
          select: { aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } },
        })
        const subjectName = subjectPerson?.aliases[0]?.name
        if (subjectName) {
          await tx.setCreditRaw.create({
            data: {
              setId: set.id,
              rawName: subjectName,
              nameNorm: normalizeForSearch(subjectName),
              roleDefinitionId: modelRole.id,
              resolutionStatus: 'RESOLVED',
              resolvedPersonId: personItem.matchedEntityId,
            },
          })
        }
      }

      // Co-model contributions
      const modelsList = (data.modelsList ?? (data as ItemData).modelsList) as Array<{ name: string; icgId: string; url: string }> | null
      if (modelsList && modelRole) {
        const personIcgId = await getSubjectIcgId(item.batchId)
        for (const model of modelsList) {
          if (model.icgId === personIcgId) continue
          const coModelPerson = await tx.person.findUnique({
            where: { icgId: model.icgId },
            select: { id: true },
          })
          if (!coModelPerson) continue

          await tx.sessionContribution.upsert({
            where: {
              sessionId_personId_roleDefinitionId: {
                sessionId: session.id,
                personId: coModelPerson.id,
                roleDefinitionId: modelRole.id,
              },
            },
            update: {},
            create: {
              sessionId: session.id,
              personId: coModelPerson.id,
              roleDefinitionId: modelRole.id,
              confidence: 'CONFIRMED',
              confidenceSource: 'CREDIT_MATCH',
            },
          })

          // Create resolved credit for co-model
          await tx.setCreditRaw.create({
            data: {
              setId: set.id,
              rawName: model.name,
              nameNorm: normalizeForSearch(model.name),
              roleDefinitionId: modelRole.id,
              resolutionStatus: 'RESOLVED',
              resolvedPersonId: coModelPerson.id,
            },
          })
        }
      }

      // Rebuild SetParticipant cache from SessionContribution
      await rebuildSetParticipantsFromContributions(tx, set.id)

      return { setId: set.id, sessionId: session.id }
    })

    await markItemImported(item.id, result.setId)
    await computeDependencies(item.batchId)
    return { success: true, entityId: result.setId, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Helper ─────────────────────────────────────────────────────────────────

async function getSubjectIcgId(batchId: string): Promise<string | null> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { subjectIcgId: true },
  })
  return batch?.subjectIcgId ?? null
}

// ─── Manual Staging Set Promotion ───────────────────────────────────────────

/**
 * Promotes a manually-created staging set (importItemId = null).
 * Reads participant data from participantStatuses (which has resolved personIds)
 * and creates the same Set + Session + contributions as the import path.
 */
export async function promoteManualStagingSet(stagingSetId: string): Promise<ImportResult> {
  const stagingSet = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    select: {
      title: true,
      channelId: true,
      channelName: true,
      releaseDate: true,
      releaseDatePrecision: true,
      isVideo: true,
      description: true,
      imageCount: true,
      externalId: true,
      artist: true,
      participantStatuses: true,
      matchedSetId: true,
      matchConfidence: true,
      coverImageUrl: true,
      mediaPriority: true,
      mediaQueueAt: true,
    },
  })
  if (!stagingSet) return { success: false, entityId: null, error: 'Staging set not found' }

  const participantStatuses = (stagingSet.participantStatuses ?? []) as ParticipantStatus[]
  const knownParticipants = participantStatuses.filter((p) => p.status === 'known' && p.personId)
  const unknownParticipants = participantStatuses.filter((p) => p.status !== 'known')

  try {
    // Path A: Enrich existing matched Set — gated by the three-guard
    // validator that prevents the "Attached → Grecian Sirens" bug class
    // (stale-match, externalId drift, fuzzy-confidence merge).
    if (stagingSet.matchedSetId) {
      const verdict = await validateCachedMatchForPromote(
        stagingSetId,
        stagingSet.matchedSetId,
        stagingSet.matchConfidence,
        stagingSet.externalId,
      )
      if (verdict.kind === 'error') {
        return { success: false, entityId: null, error: verdict.error }
      }
      // verdict.kind === 'create-new' → fall through to Path B below
      if (verdict.kind === 'enrich') {
        const setId = verdict.matchedSetId
        await prisma.$transaction(async (tx) => {
        const setSession = await tx.setSession.findFirst({
          where: { setId, isPrimary: true },
          select: { sessionId: true },
        })
        if (!setSession) return
        const sessionId = setSession.sessionId

        const modelRole = await tx.contributionRoleDefinition.findFirst({
          where: { slug: 'model' },
          select: { id: true },
        })
        if (!modelRole) return

        for (const p of knownParticipants) {
          await tx.sessionContribution.upsert({
            where: {
              sessionId_personId_roleDefinitionId: {
                sessionId,
                personId: p.personId!,
                roleDefinitionId: modelRole.id,
              },
            },
            update: {},
            create: {
              sessionId,
              personId: p.personId!,
              roleDefinitionId: modelRole.id,
              confidence: 'CONFIRMED',
              confidenceSource: 'MANUAL',
            },
          })
          const existingCredit = await tx.setCreditRaw.findFirst({
            where: { setId, resolvedPersonId: p.personId! },
            select: { id: true },
          })
          if (!existingCredit) {
            await tx.setCreditRaw.create({
              data: {
                setId,
                rawName: p.name,
                nameNorm: normalizeForSearch(p.name),
                roleDefinitionId: modelRole.id,
                resolutionStatus: 'RESOLVED',
                resolvedPersonId: p.personId!,
              },
            })
          }
        }

        // Fill empty fields on the matched Set — mirror enrichExistingSet so a
        // manual promote backfills the same data (esp. externalId) the comparison
        // view promised. externalId is @unique → only claim it if unheld.
        const existingSet = await tx.set.findUnique({
          where: { id: setId },
          select: { description: true, imageCount: true, externalId: true },
        })
        if (existingSet) {
          const updates: Record<string, unknown> = {}
          if (!existingSet.description && stagingSet.description) updates.description = stagingSet.description
          if (existingSet.imageCount == null && stagingSet.imageCount != null) updates.imageCount = stagingSet.imageCount
          if (!existingSet.externalId && stagingSet.externalId) {
            const clash = await tx.set.findFirst({
              where: { externalId: stagingSet.externalId, id: { not: setId } },
              select: { id: true },
            })
            if (!clash) updates.externalId = stagingSet.externalId
          }
          if (Object.keys(updates).length > 0) {
            await tx.set.update({ where: { id: setId }, data: updates })
          }
        }

        await rebuildSetParticipantsFromContributions(tx, setId)
      })
      await markStagingSetPromoted(stagingSetId, setId)
      return { success: true, entityId: setId, error: null }
      } // end if (verdict.kind === 'enrich')
    } // end if (stagingSet.matchedSetId)

    // Path B: Create new Set
    if (!stagingSet.channelId) {
      return {
        success: false,
        entityId: null,
        error: 'Channel must be resolved before promoting a manual staging set',
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Owning label: Channel.labelId FK is authoritative (ADR-0020 Phase 2);
      // fall back to the highest-confidence map only when the FK is unset
      // (pre-dual-write channels). Fallback removed in Phase 5.
      const channelRow = await tx.channel.findUnique({
        where: { id: stagingSet.channelId! },
        select: { labelId: true },
      })
      let ownerLabelId = channelRow?.labelId ?? undefined
      if (!ownerLabelId) {
        const channelMaps = await tx.channelLabelMap.findMany({
          where: { channelId: stagingSet.channelId! },
          select: { labelId: true, confidence: true },
        })
        ownerLabelId = pickOwnerLabelId(channelMaps)
      }

      const title = stagingSet.title
      const session = await tx.session.create({
        data: {
          name: title,
          nameNorm: normalizeForSearch(title),
          status: 'DRAFT',
          date: stagingSet.releaseDate ?? undefined,
          datePrecision: stagingSet.releaseDatePrecision,
          labelId: ownerLabelId,
        },
      })

      const set = await tx.set.create({
        data: {
          type: stagingSet.isVideo ? 'video' : 'photo',
          title,
          titleNorm: normalizeForSearch(title),
          channelId: stagingSet.channelId!,
          description: stagingSet.description ?? undefined,
          releaseDate: stagingSet.releaseDate ?? undefined,
          releaseDatePrecision: stagingSet.releaseDatePrecision,
          imageCount: stagingSet.imageCount,
          externalId: stagingSet.externalId ?? undefined,
        },
      })

      await tx.setSession.create({
        data: { setId: set.id, sessionId: session.id, isPrimary: true },
      })

      const modelRole = await tx.contributionRoleDefinition.findFirst({
        where: { slug: 'model' },
        select: { id: true },
      })

      if (modelRole) {
        for (const p of knownParticipants) {
          await tx.sessionContribution.create({
            data: {
              sessionId: session.id,
              personId: p.personId!,
              roleDefinitionId: modelRole.id,
              confidence: 'CONFIRMED',
              confidenceSource: 'MANUAL',
            },
          })
          await tx.setCreditRaw.create({
            data: {
              setId: set.id,
              rawName: p.name,
              nameNorm: normalizeForSearch(p.name),
              roleDefinitionId: modelRole.id,
              resolutionStatus: 'RESOLVED',
              resolvedPersonId: p.personId!,
            },
          })
        }
      }

      for (const p of unknownParticipants) {
        await tx.setCreditRaw.create({
          data: {
            setId: set.id,
            rawName: p.name,
            nameNorm: normalizeForSearch(p.name),
            resolutionStatus: 'UNRESOLVED',
          },
        })
      }

      if (stagingSet.artist) {
        await tx.setCreditRaw.create({
          data: {
            setId: set.id,
            rawName: stagingSet.artist,
            nameNorm: normalizeForSearch(stagingSet.artist),
            resolutionStatus: 'UNRESOLVED',
          },
        })
      }

      await rebuildSetParticipantsFromContributions(tx, set.id)
      return { setId: set.id }
    })

    await markStagingSetPromoted(stagingSetId, result.setId)

    if (stagingSet.mediaPriority || stagingSet.mediaQueueAt) {
      await prisma.set.update({
        where: { id: result.setId },
        data: {
          mediaPriority: stagingSet.mediaPriority,
          mediaQueueAt: stagingSet.mediaQueueAt,
        },
      })
    }

    if (stagingSet.coverImageUrl) {
      transferStagingCoverToSet(stagingSet.coverImageUrl, result.setId).catch(console.error)
    }

    return { success: true, entityId: result.setId, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Import dispatcher ──────────────────────────────────────────────────────

export async function importItem(item: ImportItem): Promise<ImportResult> {
  switch (item.type) {
    case 'LABEL':
      return importLabel(item)
    case 'CHANNEL':
      return importChannel(item)
    case 'PERSON':
      return importPerson(item)
    case 'PERSON_ALIAS':
      return importAlias(item)
    case 'DIGITAL_IDENTITY':
      return importDigitalIdentity(item)
    case 'SET':
      return importSet(item)
    case 'CO_MODEL':
      // Co-models are informational only — they must already exist in DB
      if (item.matchedEntityId) {
        await markItemImported(item.id, item.matchedEntityId)
        return { success: true, entityId: item.matchedEntityId, error: null }
      }
      return { success: false, entityId: null, error: 'Co-model person does not exist in DB. Create them first via their own import file or manually.' }
    case 'CREDIT':
      // Credits are created as part of set import, not independently
      return { success: true, entityId: null, error: null }
    default:
      return { success: false, entityId: null, error: `Unknown item type: ${item.type}` }
  }
}
