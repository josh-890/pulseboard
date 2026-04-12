'use server'

import { withTenantFromHeaders } from '@/lib/tenant-context'
import { revalidatePath } from 'next/cache'
import {
  recordStagingSetArchivePath,
  clearStagingSetArchivePath,
  recordSetArchivePath,
  clearSetArchivePath,
  toggleStagingSetMediaQueue,
  toggleSetMediaQueue,
  updateStagingSetMediaPriority,
  updateSetMediaPriority,
} from '@/lib/services/archive-service'
import type { SimpleActionResult } from '@/lib/types'

// ─── Archive Path Actions ─────────────────────────────────────────────────────

export async function recordArchivePathAction(
  id: string,
  type: 'staging' | 'set',
  path: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (type === 'staging') {
        await recordStagingSetArchivePath(id, path)
        revalidatePath('/import')
      } else {
        await recordSetArchivePath(id, path)
        revalidatePath('/sets')
        revalidatePath(`/sets/${id}`)
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to record archive path' }
    }
  })
}

export async function clearArchivePathAction(
  id: string,
  type: 'staging' | 'set',
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (type === 'staging') {
        await clearStagingSetArchivePath(id)
        revalidatePath('/import')
      } else {
        await clearSetArchivePath(id)
        revalidatePath('/sets')
        revalidatePath(`/sets/${id}`)
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to clear archive path' }
    }
  })
}

// ─── Media Queue Actions ──────────────────────────────────────────────────────

export async function toggleMediaQueueAction(
  id: string,
  type: 'staging' | 'set',
  priority?: number,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (type === 'staging') {
        await toggleStagingSetMediaQueue(id, priority)
        revalidatePath('/import')
      } else {
        await toggleSetMediaQueue(id, priority)
        revalidatePath('/sets')
      }
      revalidatePath('/media-queue')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to update media queue' }
    }
  })
}

export async function updateMediaPriorityAction(
  id: string,
  type: 'staging' | 'set',
  priority: number,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (type === 'staging') {
        await updateStagingSetMediaPriority(id, priority)
      } else {
        await updateSetMediaPriority(id, priority)
      }
      revalidatePath('/media-queue')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to update priority' }
    }
  })
}
