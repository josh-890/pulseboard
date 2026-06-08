'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import {
  refreshAllParticipantStatuses,
  refreshIfStale,
} from '@/lib/services/import/participant-status-service'
import {
  refreshAllMatches,
  refreshMatchesIfStale,
} from '@/lib/services/import/match-refresh-service'
import { confirmArchiveFolderLink } from '@/lib/services/archive-service'
import type { DatePrecision } from '@/generated/prisma/client'

export async function refreshParticipantStatusesAction(): Promise<{ updated: number }> {
  return withTenantFromHeaders(async () => {
    const updated = await refreshAllParticipantStatuses()
    revalidatePath('/staging-sets')
    return { updated }
  })
}

export async function refreshMatchesAction(): Promise<{ updated: number }> {
  return withTenantFromHeaders(async () => {
    const updated = await refreshAllMatches()
    revalidatePath('/staging-sets')
    return { updated }
  })
}

/**
 * Refresh both participant statuses and matches.
 * Called by the manual refresh button.
 */
export async function refreshAllStagingDataAction(): Promise<{ statuses: number; matches: number }> {
  return withTenantFromHeaders(async () => {
    const [statuses, matches] = await Promise.all([
      refreshAllParticipantStatuses(),
      refreshAllMatches(),
    ])
    revalidatePath('/staging-sets')
    return { statuses, matches }
  })
}

/**
 * Auto-refresh if >24hrs since last refresh. Called on workspace mount.
 * Returns updated counts (0 if no refresh was needed).
 */
export async function autoRefreshStagingDataAction(): Promise<{ statuses: number; matches: number }> {
  return withTenantFromHeaders(async () => {
    const [statuses, matches] = await Promise.all([
      refreshIfStale(),
      refreshMatchesIfStale(),
    ])
    if (statuses > 0 || matches > 0) revalidatePath('/staging-sets')
    return { statuses, matches }
  })
}

// ─── Date Suggestion Actions ─────────────────────────────────────────────────

export type SimpleActionResult = { success: boolean; error?: string }

/** Accept the suggested date: set it as the confirmed releaseDate and clear the suggestion. */
export async function acceptDateSuggestionAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const ss = await prisma.stagingSet.findUnique({
        where: { id },
        select: { releaseDateSuggestion: true },
      })
      if (!ss?.releaseDateSuggestion) {
        return { success: false, error: 'No suggestion to accept' }
      }
      const date = new Date(ss.releaseDateSuggestion)
      if (isNaN(date.getTime())) {
        return { success: false, error: 'Invalid suggested date' }
      }
      await prisma.stagingSet.update({
        where: { id },
        data: {
          releaseDate: date,
          releaseDatePrecision: 'DAY',
          releaseDateSuggestion: null,
        },
      })
      revalidatePath('/staging-sets')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to accept date suggestion' }
    }
  })
}

// ─── Manual Staging Set Creation ─────────────────────────────────────────────

type ManualParticipantInput = {
  name: string
  icgId?: string
  personId?: string
}

type CreateManualStagingSetInput = {
  title: string
  channelId: string
  releaseDate?: string
  releaseDatePrecision?: DatePrecision
  isVideo?: boolean
  externalId?: string
  notes?: string
  participants: ManualParticipantInput[]
  /** When set, the new staging set is linked (CONFIRMED) to this archive folder. */
  archiveFolderId?: string
}

export async function createManualStagingSetAction(
  input: CreateManualStagingSetInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { name: true },
    })
    if (!channel) return { success: false, error: 'Channel not found' }

    const knownPersonIds = input.participants.filter((p) => p.personId).map((p) => p.personId!)
    const knownPersonIcgIds = input.participants.filter((p) => p.icgId).map((p) => p.icgId!)

    const participantStatuses = input.participants.map((p) => ({
      name: p.name,
      icgId: p.icgId ?? '',
      status: p.personId ? ('known' as const) : ('candidate' as const),
      ...(p.personId ? { personId: p.personId } : {}),
    }))

    const stagingSet = await prisma.stagingSet.create({
      data: {
        title: input.title,
        titleNorm: normalizeForSearch(input.title),
        channelId: input.channelId,
        channelName: channel.name,
        releaseDate: input.releaseDate ? new Date(input.releaseDate) : null,
        releaseDatePrecision: input.releaseDatePrecision ?? 'UNKNOWN',
        isVideo: input.isVideo ?? false,
        externalId: input.externalId ?? null,
        notes: input.notes ?? null,
        status: 'APPROVED',
        participants: input.participants.map((p) => ({ name: p.name, icgId: p.icgId ?? '' })),
        participantStatuses,
        participantIcgIds: knownPersonIcgIds,
        participantNamesNorm: input.participants.map((p) => normalizeForSearch(p.name)).join(' '),
      },
      select: { id: true },
    })

    // Link the source archive folder (CONFIRMED) when created from the Archive Browser.
    if (input.archiveFolderId) {
      await confirmArchiveFolderLink(input.archiveFolderId, stagingSet.id, 'staging')
    }

    revalidatePath('/staging-sets')
    revalidatePath('/archive')
    for (const personId of knownPersonIds) {
      revalidatePath(`/people/${personId}`)
    }

    return { success: true, id: stagingSet.id }
  })
}

/**
 * Remove a participant from a (non-promoted) staging set, identified by name+icgId.
 * Recomputes all denormalised participant fields consistently.
 */
export async function removeStagingSetParticipantAction(
  stagingSetId: string,
  name: string,
  icgId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const ss = await prisma.stagingSet.findUnique({
        where: { id: stagingSetId },
        select: { participants: true, participantStatuses: true },
      })
      if (!ss) return { success: false, error: 'Staging set not found' }

      const matches = (p: { name?: string; icgId?: string }) =>
        p.name === name && (p.icgId ?? '') === icgId

      const participants = ((ss.participants as { name: string; icgId: string }[]) ?? []).filter(
        (p) => !matches(p),
      )
      const participantStatuses = ((ss.participantStatuses as { name: string; icgId?: string; status?: string; personId?: string }[]) ?? []).filter(
        (p) => !matches(p),
      )
      const participantIcgIds = participants.filter((p) => p.icgId).map((p) => p.icgId)
      const participantNamesNorm = participants.map((p) => normalizeForSearch(p.name)).join(' ')

      await prisma.stagingSet.update({
        where: { id: stagingSetId },
        data: { participants, participantStatuses, participantIcgIds, participantNamesNorm },
      })
      revalidatePath('/staging-sets')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to remove participant' }
    }
  })
}

/**
 * Add a participant to a (non-promoted) staging set. `personId` set → known, else a
 * candidate to resolve. No-op if already present. Recomputes denormalised fields.
 */
export async function addStagingSetParticipantAction(
  stagingSetId: string,
  participant: { name: string; icgId?: string; personId?: string },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const ss = await prisma.stagingSet.findUnique({
        where: { id: stagingSetId },
        select: { participants: true, participantStatuses: true },
      })
      if (!ss) return { success: false, error: 'Staging set not found' }

      const participants = (ss.participants as { name: string; icgId: string }[]) ?? []
      const statuses = (ss.participantStatuses as { name: string; icgId?: string; status?: string; personId?: string }[]) ?? []
      const icg = participant.icgId ?? ''

      const dup = participant.personId
        ? statuses.some((p) => p.personId === participant.personId)
        : participants.some((p) => p.name === participant.name && (p.icgId ?? '') === icg)
      if (dup) return { success: true }

      const newParticipants = [...participants, { name: participant.name, icgId: icg }]
      const newStatuses = [
        ...statuses,
        {
          name: participant.name,
          icgId: icg,
          status: participant.personId ? ('known' as const) : ('candidate' as const),
          ...(participant.personId ? { personId: participant.personId } : {}),
        },
      ]
      const participantIcgIds = newParticipants.filter((p) => p.icgId).map((p) => p.icgId)
      const participantNamesNorm = newParticipants.map((p) => normalizeForSearch(p.name)).join(' ')

      await prisma.stagingSet.update({
        where: { id: stagingSetId },
        data: { participants: newParticipants, participantStatuses: newStatuses, participantIcgIds, participantNamesNorm },
      })
      revalidatePath('/staging-sets')
      if (participant.personId) revalidatePath(`/people/${participant.personId}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to add participant' }
    }
  })
}

/**
 * Persistently reject the cached match ("Wrong Match"): clear it and remember the target
 * so the matcher won't re-cache it. Lets a fuzzy series match (e.g. "Part 2" → "Part 1")
 * be dismissed for good, so the set can promote as a new Set.
 */
export async function rejectStagingSetMatchAction(stagingSetId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const ss = await prisma.stagingSet.findUnique({
        where: { id: stagingSetId },
        select: { matchedSetId: true, rejectedMatchSetIds: true },
      })
      if (!ss) return { success: false, error: 'Staging set not found' }

      const rejected = new Set(ss.rejectedMatchSetIds)
      if (ss.matchedSetId) rejected.add(ss.matchedSetId)

      await prisma.stagingSet.update({
        where: { id: stagingSetId },
        data: {
          matchedSetId: null,
          matchConfidence: null,
          matchDetails: null,
          rejectedMatchSetIds: [...rejected],
        },
      })
      revalidatePath('/staging-sets')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to reject match' }
    }
  })
}

/** Dismiss the suggested date without applying it. */
export async function dismissDateSuggestionAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.stagingSet.update({
        where: { id },
        data: { releaseDateSuggestion: null },
      })
      revalidatePath('/staging-sets')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to dismiss date suggestion' }
    }
  })
}
