/**
 * Participant status refresh service.
 *
 * Maintains the pre-computed `participantStatuses` JSON on StagingSet rows.
 * Three refresh strategies:
 *  - Targeted by icgId (after Person creation)
 *  - Targeted by nameNorm (after Alias creation)
 *  - Full refresh (manual, all non-terminal rows)
 *
 * Also handles 24hr auto-refresh throttle via the Setting table.
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { normalizeForSearch } from '@/lib/normalize'
import { getHeadshotsForPersons } from '@/lib/services/media-service'
import type { ParticipantStatus } from './staging-set-service'

const REFRESH_SETTING_KEY = 'participantStatuses.lastRefresh'

type RawParticipant = { name: string; icgId: string }

// ─── Targeted Refresh ─────────────────────────────────────────────────────

/**
 * Refresh participantStatuses on staging sets that contain the given icgId.
 * Called after a Person is created with that icgId.
 */
export async function refreshStatusesForIcgId(icgId: string): Promise<number> {
  const affected = await prisma.stagingSet.findMany({
    where: {
      participantIcgIds: { has: icgId },
      status: { notIn: ['SKIPPED'] },
    },
    select: { id: true, participants: true },
  })
  if (affected.length === 0) return 0

  return recomputeStatusesForSets(affected)
}

/**
 * Refresh participantStatuses on staging sets whose participantNamesNorm
 * contains the given normalized name.
 * Called after a PersonAlias is created.
 */
export async function refreshStatusesForNameNorm(nameNorm: string): Promise<number> {
  const affected = await prisma.stagingSet.findMany({
    where: {
      participantNamesNorm: { contains: nameNorm, mode: 'insensitive' },
      status: { notIn: ['SKIPPED'] },
    },
    select: { id: true, participants: true },
  })
  if (affected.length === 0) return 0

  return recomputeStatusesForSets(affected)
}

// ─── Full Refresh ─────────────────────────────────────────────────────────

/**
 * Recompute participantStatuses for ALL non-terminal staging sets.
 * Used by the manual refresh button and backfill script.
 */
export async function refreshAllParticipantStatuses(): Promise<number> {
  const sets = await prisma.stagingSet.findMany({
    where: {
      participants: { not: Prisma.JsonNullValueFilter.DbNull },
      status: { notIn: ['SKIPPED'] },
    },
    select: { id: true, participants: true },
  })
  if (sets.length === 0) return 0

  const updated = await recomputeStatusesForSets(sets)

  // Record the refresh timestamp
  await prisma.setting.upsert({
    where: { key: REFRESH_SETTING_KEY },
    update: { value: new Date().toISOString() },
    create: { key: REFRESH_SETTING_KEY, value: new Date().toISOString() },
  })

  return updated
}

// ─── Auto-Refresh (24hr Throttle) ─────────────────────────────────────────

/**
 * Refresh all participant statuses if more than 24 hours have passed
 * since the last full refresh. Returns the number of updated sets,
 * or 0 if no refresh was needed.
 */
export async function refreshIfStale(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: REFRESH_SETTING_KEY },
  })

  if (setting) {
    const lastRefresh = new Date(setting.value)
    const hoursSince = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60)
    if (hoursSince < 24) return 0
  }

  return refreshAllParticipantStatuses()
}

// ─── Internal ─────────────────────────────────────────────────────────────

async function recomputeStatusesForSets(
  sets: Array<{ id: string; participants: unknown }>,
): Promise<number> {
  // Collect all unique icgIds and normalized names across affected sets
  const allIcgIds = new Set<string>()
  const allNames = new Set<string>()

  for (const s of sets) {
    const participants = s.participants as RawParticipant[]
    for (const p of participants) {
      allIcgIds.add(p.icgId)
      allNames.add(normalizeForSearch(p.name))
    }
  }

  // Batch lookups
  const knownPersons = await prisma.person.findMany({
    where: { icgId: { in: Array.from(allIcgIds) } },
    select: { id: true, icgId: true },
  })
  const personByIcgId = new Map(knownPersons.map((p) => [p.icgId, p.id]))

  const candidateAliases = await prisma.personAlias.findMany({
    where: { nameNorm: { in: Array.from(allNames) } },
    select: { nameNorm: true },
  })
  const candidateNameNorms = new Set(candidateAliases.map((a) => a.nameNorm))

  // Batch fetch headshots for all known person IDs
  const knownPersonIds = Array.from(personByIcgId.values())
  const headshotMap = await getHeadshotsForPersons(knownPersonIds)

  // Update each set
  let updated = 0
  for (const s of sets) {
    const participants = s.participants as RawParticipant[]
    const statuses: ParticipantStatus[] = participants.map((p) => {
      const personId = personByIcgId.get(p.icgId)
      if (personId) {
        const headshot = headshotMap.get(personId)
        return {
          name: p.name,
          icgId: p.icgId,
          status: 'known' as const,
          personId,
          thumbnailUrl: headshot?.url,
        }
      }
      const nameNorm = normalizeForSearch(p.name)
      if (candidateNameNorms.has(nameNorm)) {
        return { name: p.name, icgId: p.icgId, status: 'candidate' as const }
      }
      return { name: p.name, icgId: p.icgId, status: 'new' as const }
    })

    await prisma.stagingSet.update({
      where: { id: s.id },
      data: { participantStatuses: statuses },
    })
    updated++
  }

  return updated
}
