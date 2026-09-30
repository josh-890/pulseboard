'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  dismissStubEnded,
  endArchiveFolderStub,
  markArchiveFolderStub,
} from '@/lib/services/archive-stub-service'
import type { MarkStubInput } from '@/lib/services/archive-stub-service'

type StubActionResult = { success: true } | { success: false; error: string }

// A stub badge shows on every surface that shows the archive link.
function revalidateArchiveSurfaces() {
  revalidatePath('/archive')
  revalidatePath('/staging-sets')
  revalidatePath('/sets', 'layout')
  revalidatePath('/people', 'layout')
}

export async function markArchiveStubAction(folderId: string, input: MarkStubInput): Promise<StubActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await markArchiveFolderStub(folderId, input)
      revalidateArchiveSurfaces()
      return { success: true }
    } catch (err) {
      console.error('[archive-stub] mark failed', folderId, err)
      return { success: false, error: 'Could not mark the folder as a stub' }
    }
  })
}

export async function endArchiveStubAction(folderId: string): Promise<StubActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await endArchiveFolderStub(folderId)
      revalidateArchiveSurfaces()
      return { success: true }
    } catch (err) {
      console.error('[archive-stub] end failed', folderId, err)
      return { success: false, error: 'Could not end the stub' }
    }
  })
}

export async function dismissStubEndedAction(folderId: string): Promise<StubActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await dismissStubEnded(folderId)
      revalidateArchiveSurfaces()
      return { success: true }
    } catch (err) {
      console.error('[archive-stub] dismiss failed', folderId, err)
      return { success: false, error: 'Could not dismiss' }
    }
  })
}
