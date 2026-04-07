/**
 * Import executor — per-entity import functions.
 *
 * Each function takes an ImportItem, validates dependencies,
 * calls the appropriate service function, and returns the created entity ID.
 */

import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import type { ImportItem } from '@/generated/prisma/client'
import { createLabelRecord } from '@/lib/services/label-service'
import { createChannelRecord } from '@/lib/services/channel-service'
import { createPersonRecord } from '@/lib/services/person-service'
import { createAlias, linkAliasToChannels } from '@/lib/services/alias-service'
import { createDigitalIdentity } from '@/lib/services/digital-identity-service'
import { rebuildSetParticipantsFromContributions } from '@/lib/services/contribution-service'
import { markItemImported, computeDependencies } from './staging-service'
import { markStagingSetPromoted } from './staging-set-service'
import { parseBreastDescription, extractCupFromMeasurements } from './import-utils'
import { transferStagingCoverToSet } from './cover-transfer'

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

// ─── Import: Person ─────────────────────────────────────────────────────────

export async function importPerson(item: ImportItem): Promise<ImportResult> {
  try {
    const data = (item.editedData ?? item.data) as ItemData

    if (item.matchedEntityId) {
      await markItemImported(item.id, item.matchedEntityId)
      return { success: true, entityId: item.matchedEntityId, error: null }
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

    // Best cup size: prefer measurements-derived (precise letter) over text description
    const naturalCup = cupFromMeasurements ?? breastParsed?.cupSize ?? null

    const hairColor = data.hairColor as string | undefined

    const person = await createPersonRecord({
      icgId: data.icgId as string,
      commonName: data.name as string,
      status: 'active',
      birthdate,
      birthdatePrecision,
      birthdateModifier: 'EXACT',
      nationality,
      naturalHairColor: hairColor,
      currentHairColor: hairColor, // same as natural at baseline
      height: data.heightCm as number | undefined,
      sexAtBirth: 'female' as const,
    })

    // Update additional person fields not covered by createPersonRecord
    const additionalUpdates: Record<string, unknown> = {}

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
      additionalUpdates.bio = bioParts.join('\n\n')
    }

    if (measurementsRaw) {
      additionalUpdates.measurements = measurementsRaw
    }

    if (naturalCup) {
      additionalUpdates.naturalBreastSize = naturalCup
    }

    if (Object.keys(additionalUpdates).length > 0) {
      await prisma.person.update({
        where: { id: person.id },
        data: additionalUpdates,
      })
    }

    // Update baseline persona physical with breast data + hair color
    if (breastParsed || hairColor) {
      const baselinePersona = await prisma.persona.findFirst({
        where: { personId: person.id, isBaseline: true },
        select: { id: true },
      })

      if (baselinePersona) {
        // createPersonRecord may have already created a PersonaPhysical if currentHairColor was set
        const existing = await prisma.personaPhysical.findUnique({
          where: { personaId: baselinePersona.id },
        })

        const physicalData: Record<string, unknown> = {}
        if (hairColor) physicalData.currentHairColor = hairColor
        if (naturalCup) physicalData.breastSize = naturalCup
        if (breastParsed) {
          physicalData.breastStatus = breastParsed.status
          physicalData.breastDescription = breastParsed.raw
        }

        if (existing) {
          await prisma.personaPhysical.update({
            where: { id: existing.id },
            data: physicalData,
          })
        } else {
          await prisma.personaPhysical.create({
            data: {
              personaId: baselinePersona.id,
              ...physicalData,
            },
          })
        }
      }
    }

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
        nameNorm: name.toLowerCase(),
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

    const identity = await createDigitalIdentity({
      personId,
      platform: data.platform as string,
      handle: (data.handle as string) || undefined,
      url: (data.url as string) || undefined,
      status: 'active',
    })

    await markItemImported(item.id, identity.id)

    return { success: true, entityId: identity.id, error: null }
  } catch (err) {
    return { success: false, entityId: null, error: String(err) }
  }
}

// ─── Import: Set ────────────────────────────────────────────────────────────

export async function importSet(item: ImportItem): Promise<ImportResult> {
  try {
    // Load the linked StagingSet for richer data
    const stagingSet = await prisma.stagingSet.findUnique({
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

    // Path A: Enrich existing set (matched by externalId or user-confirmed)
    const matchedSetId = stagingSet?.matchedSetId ?? item.matchedEntityId
    if (matchedSetId) {
      const enrichResult = await enrichExistingSet(item, matchedSetId, data)
      if (stagingSet) {
        await markStagingSetPromoted(stagingSet.id, matchedSetId)
        // Transfer cover image (fire-and-forget, non-critical)
        if (stagingSet.coverImageUrl) {
          transferStagingCoverToSet(stagingSet.coverImageUrl, matchedSetId).catch((err) =>
            console.error('Cover transfer failed (enrich):', err),
          )
        }
      }
      return enrichResult
    }

    // Path B: Create new set
    const createResult = await createNewSet(item, data)
    if (stagingSet && createResult.entityId) {
      await markStagingSetPromoted(stagingSet.id, createResult.entityId)
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
        select: { description: true, imageCount: true },
      })
      if (existingSet) {
        const updates: Record<string, unknown> = {}
        if (!existingSet.description && data.description) updates.description = data.description
        if (existingSet.imageCount == null && data.imageCount != null) updates.imageCount = data.imageCount
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
      const channelLabel = await tx.channelLabelMap.findFirst({
        where: { channelId },
        orderBy: { confidence: 'desc' },
        select: { labelId: true },
      })

      const title = data.title as string
      const session = await tx.session.create({
        data: {
          name: title,
          nameNorm: normalizeForSearch(title),
          status: 'DRAFT',
          date: dateStr ? new Date(dateStr) : undefined,
          datePrecision: releaseDatePrecision,
          labelId: channelLabel?.labelId ?? undefined,
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
