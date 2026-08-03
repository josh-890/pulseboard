'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  confirmAttributionGroup,
  decideAttributionGroup,
  undoAttributionGroup,
  getGroupFolders,
  type ConfirmResult,
} from '@/lib/services/attribution-confirm-service'

export type AttributionActionResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * Confirm one group. Deliberately one group per call — no "confirm all visible".
 *
 * This is the first path in the project that can write wrong person data at
 * volume: a single confirmation touches up to 204 folders. Until the real error
 * rate is known, the rate limiter is the operator's hand.
 */
export async function confirmAttributionGroupAction(
  groupKey: string,
  icgIds: string[],
): Promise<AttributionActionResult<ConfirmResult>> {
  return withTenantFromHeaders(async () => {
    try {
      const data = await confirmAttributionGroup(groupKey, icgIds)
      revalidatePath('/archive/attribution')
      revalidatePath('/archive')
      return { success: true, data }
    } catch (err) {
      console.error('confirmAttributionGroupAction failed', err)
      return { success: false, error: err instanceof Error ? err.message : 'Confirm failed' }
    }
  })
}

export async function markGroupNotAPersonAction(
  groupKey: string,
  note?: string,
): Promise<AttributionActionResult<{ groupKey: string; folderCount: number }>> {
  return withTenantFromHeaders(async () => {
    try {
      const data = await decideAttributionGroup(groupKey, 'NOT_A_PERSON', note)
      revalidatePath('/archive/attribution')
      return { success: true, data }
    } catch (err) {
      console.error('markGroupNotAPersonAction failed', err)
      return { success: false, error: err instanceof Error ? err.message : 'Failed' }
    }
  })
}

export async function skipGroupAction(
  groupKey: string,
): Promise<AttributionActionResult<{ groupKey: string; folderCount: number }>> {
  return withTenantFromHeaders(async () => {
    try {
      const data = await decideAttributionGroup(groupKey, 'SKIPPED')
      revalidatePath('/archive/attribution')
      return { success: true, data }
    } catch (err) {
      console.error('skipGroupAction failed', err)
      return { success: false, error: err instanceof Error ? err.message : 'Failed' }
    }
  })
}

export async function undoAttributionGroupAction(
  groupKey: string,
): Promise<AttributionActionResult<{ removedAttributions: number }>> {
  return withTenantFromHeaders(async () => {
    try {
      const data = await undoAttributionGroup(groupKey)
      revalidatePath('/archive/attribution')
      revalidatePath('/archive')
      return { success: true, data }
    } catch (err) {
      console.error('undoAttributionGroupAction failed', err)
      return { success: false, error: err instanceof Error ? err.message : 'Undo failed' }
    }
  })
}

/** Member folders of a group — loaded on expand, not with the list (up to 204 rows). */
export async function getGroupFoldersAction(
  groupKey: string,
): Promise<AttributionActionResult<Awaited<ReturnType<typeof getGroupFolders>>>> {
  return withTenantFromHeaders(async () => {
    try {
      return { success: true, data: await getGroupFolders(groupKey) }
    } catch (err) {
      console.error('getGroupFoldersAction failed', err)
      return { success: false, error: err instanceof Error ? err.message : 'Failed to load folders' }
    }
  })
}
