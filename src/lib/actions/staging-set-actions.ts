'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import {
  refreshAllParticipantStatuses,
  refreshIfStale,
} from '@/lib/services/import/participant-status-service'
import {
  refreshAllMatches,
  refreshMatchesIfStale,
} from '@/lib/services/import/match-refresh-service'

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
