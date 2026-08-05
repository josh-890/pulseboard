'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  confirmFolderIdentity,
  confirmFoldersIdentity,
  rejectFolderIdentity,
  skipFolderIdentity,
  undoFolderIdentity,
  decideAttributionGroup,
  undoAttributionGroup,
  getGroupFoldersWithReferences,
  rejectCandidate,
  searchAssignablePeople,
  developFolder,
  waitOnFolder,
  type ConfirmResult,
} from '@/lib/services/attribution-confirm-service'

export type AttributionActionResult<T> = { success: true; data: T } | { success: false; error: string }

async function run<T>(fn: () => Promise<T>, paths: string[]): Promise<AttributionActionResult<T>> {
  return withTenantFromHeaders(async () => {
    try {
      const data = await fn()
      for (const p of paths) revalidatePath(p)
      return { success: true, data }
    } catch (err) {
      console.error('attribution action failed', err)
      return { success: false, error: err instanceof Error ? err.message : 'Action failed' }
    }
  })
}

const QUEUE = ['/archive/attribution']
const BOTH = ['/archive/attribution', '/archive/develop', '/archive']

// ── Stage 1: identity, one folder at a time ─────────────────────────────────
//
// The group-level confirm this replaces could write 204 folders from one click,
// and `AA | Anna` showed the group mixes distinct people under one alias. The
// unit of decision is the folder; the group only organises.

export async function confirmFolderAction(
  folderId: string,
  icgIds: string[],
  names?: Record<string, string>,
): Promise<AttributionActionResult<ConfirmResult>> {
  return run(() => confirmFolderIdentity(folderId, icgIds, names), QUEUE)
}

/**
 * Confirm a hand-built selection.
 *
 * The safety property is in the selection, not the write: nothing is ever
 * pre-selected, so every folder here was touched by the operator. That is the
 * difference from Apple Photos' batch confirm, which pre-fills look-alikes and
 * merges two people when one slips through unnoticed.
 */
export async function confirmFoldersAction(
  folderIds: string[],
  icgIds: string[],
  names?: Record<string, string>,
): Promise<AttributionActionResult<ConfirmResult>> {
  return run(() => confirmFoldersIdentity(folderIds, icgIds, names), QUEUE)
}

export async function rejectFolderAction(folderId: string): Promise<AttributionActionResult<null>> {
  return run(async () => {
    await rejectFolderIdentity(folderId)
    return null
  }, QUEUE)
}

export async function skipFolderAction(folderId: string): Promise<AttributionActionResult<null>> {
  return run(async () => {
    await skipFolderIdentity(folderId)
    return null
  }, QUEUE)
}

export async function undoFolderAction(
  folderId: string,
): Promise<AttributionActionResult<{ removedAttributions: number }>> {
  return run(() => undoFolderIdentity(folderId), BOTH)
}

// ── Group level: only truths that really are about the group ────────────────

export async function markGroupNotAPersonAction(
  groupKey: string,
  note?: string,
): Promise<AttributionActionResult<{ groupKey: string; folderCount: number }>> {
  return run(() => decideAttributionGroup(groupKey, 'NOT_A_PERSON', note), QUEUE)
}

export async function skipGroupAction(
  groupKey: string,
): Promise<AttributionActionResult<{ groupKey: string; folderCount: number }>> {
  return run(() => decideAttributionGroup(groupKey, 'SKIPPED'), QUEUE)
}

export async function undoAttributionGroupAction(
  groupKey: string,
): Promise<AttributionActionResult<{ removedAttributions: number }>> {
  return run(() => undoAttributionGroup(groupKey), BOTH)
}

/**
 * Member folders of a group plus a reference face per person — loaded on expand,
 * not with the list (up to 204 rows).
 */
export async function getGroupFoldersAction(
  groupKey: string,
): Promise<AttributionActionResult<Awaited<ReturnType<typeof getGroupFoldersWithReferences>>>> {
  return run(() => getGroupFoldersWithReferences(groupKey), [])
}

/**
 * Dismiss one candidate for one folder.
 *
 * `remainingCandidates` comes from the client because the candidate list is
 * assembled there from the folder's own suggestions plus the group's votes —
 * exhausting it is what turns the folder into REJECTED.
 */
export async function rejectCandidateAction(
  folderId: string,
  icgId: string,
  remainingCandidates: number,
): Promise<AttributionActionResult<{ exhausted: boolean }>> {
  return run(() => rejectCandidate(folderId, icgId, remainingCandidates), QUEUE)
}

/** Type-to-find a person the matcher never proposed. Read-only. */
export async function searchAssignablePeopleAction(
  q: string,
): Promise<AttributionActionResult<Awaited<ReturnType<typeof searchAssignablePeople>>>> {
  return run(() => searchAssignablePeople(q), [])
}

// ── Stage 2: development, a separate pass ───────────────────────────────────

export async function developFolderAction(
  folderId: string,
): Promise<AttributionActionResult<{ stagingSetId: string; participants: number }>> {
  return run(() => developFolder(folderId), ['/archive/develop', '/staging-sets', '/archive'])
}

export async function waitOnFolderAction(folderId: string): Promise<AttributionActionResult<null>> {
  return run(async () => {
    await waitOnFolder(folderId)
    return null
  }, ['/archive/develop'])
}
