'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
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
