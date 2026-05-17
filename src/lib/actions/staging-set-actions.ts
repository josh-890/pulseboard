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

    revalidatePath('/staging-sets')
    for (const personId of knownPersonIds) {
      revalidatePath(`/people/${personId}`)
    }

    return { success: true, id: stagingSet.id }
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
