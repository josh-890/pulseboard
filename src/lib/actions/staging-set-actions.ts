'use server'

import { revalidatePath } from 'next/cache'
import {
  refreshAllParticipantStatuses,
  refreshIfStale,
} from '@/lib/services/import/participant-status-service'

export async function refreshParticipantStatusesAction(): Promise<{ updated: number }> {
  const updated = await refreshAllParticipantStatuses()
  revalidatePath('/staging-sets')
  return { updated }
}

/**
 * Auto-refresh if >24hrs since last refresh. Called on workspace mount.
 * Returns updated count (0 if no refresh was needed).
 */
export async function autoRefreshParticipantStatusesAction(): Promise<{ updated: number }> {
  const updated = await refreshIfStale()
  if (updated > 0) revalidatePath('/staging-sets')
  return { updated }
}
