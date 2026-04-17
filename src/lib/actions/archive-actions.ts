'use server'

import { withTenantFromHeaders, getCurrentTenantId } from '@/lib/tenant-context'
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
  confirmArchiveFolderLink,
  rejectArchiveSuggestion,
  createStagingSetFromOrphan,
  getArchiveWorkspace,
  getArchiveChannelSummaries,
  reparseFolderNames,
  deleteArchiveFolder,
  confirmVideoFile,
} from '@/lib/services/archive-service'
import type { WorkspaceFilters, WorkspacePage, ChannelSummary, WorkspaceCounts } from '@/lib/services/archive-service'
import type { SimpleActionResult } from '@/lib/types'
import { onArchiveFolderLinked } from '@/lib/services/coherence-service'

// ─── Archive Workspace Data ───────────────────────────────────────────────────

export async function getArchiveItemsAction(filters: WorkspaceFilters): Promise<WorkspacePage> {
  return withTenantFromHeaders(() => getArchiveWorkspace(filters))
}

export async function getArchiveChannelSummariesAction(
  tab: 'orphan' | 'linked',
  filters: Pick<WorkspaceFilters, 'isVideo' | 'search' | 'hasSuggestion'>,
): Promise<{ summaries: ChannelSummary[]; counts: WorkspaceCounts }> {
  return withTenantFromHeaders(() => getArchiveChannelSummaries(tab, filters))
}

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

// ─── Archive Workspace Actions ────────────────────────────────────────────────

export async function confirmArchiveFolderLinkAction(
  folderId: string,
  setId: string,
  type: 'set' | 'staging',
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await confirmArchiveFolderLink(folderId, setId, type)
      void onArchiveFolderLinked(folderId, type === 'set' ? { setId } : { stagingSetId: setId })
      revalidatePath('/archive')
      revalidatePath('/import')
      revalidatePath('/staging-sets')
      revalidatePath('/sets')
      if (type === 'set') {
        revalidatePath(`/sets/${setId}`)
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to confirm link' }
    }
  })
}

export async function rejectArchiveSuggestionAction(
  folderId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await rejectArchiveSuggestion(folderId)
      revalidatePath('/archive')
      revalidatePath('/import')
      revalidatePath('/staging-sets')
      revalidatePath('/sets')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to reject suggestion' }
    }
  })
}

export async function createStagingSetFromOrphanAction(
  folderId: string,
): Promise<{ success: boolean; stagingSetId?: string; error?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const { stagingSetId } = await createStagingSetFromOrphan(folderId)
      revalidatePath('/archive')
      revalidatePath('/import')
      return { success: true, stagingSetId }
    } catch {
      return { success: false, error: 'Failed to create staging set' }
    }
  })
}

export async function reparseFolderNamesAction(): Promise<{ success: boolean; updated?: number; error?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const tenant = getCurrentTenantId()
      const { updated } = await reparseFolderNames(tenant)
      revalidatePath('/archive')
      return { success: true, updated }
    } catch {
      return { success: false, error: 'Failed to re-parse folder names' }
    }
  })
}

export async function deleteArchiveFolderAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteArchiveFolder(id)
      revalidatePath('/archive')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to delete archive folder record' }
    }
  })
}

// ─── Video File Confirmation ──────────────────────────────────────────────────

export async function confirmVideoFileAction(
  id: string,
  type: 'set' | 'staging',
  filename: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await confirmVideoFile(id, type, filename)
      if (type === 'set') {
        revalidatePath('/sets')
        revalidatePath(`/sets/${id}`)
      } else {
        revalidatePath('/staging-sets')
        revalidatePath('/import')
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to confirm video file' }
    }
  })
}
