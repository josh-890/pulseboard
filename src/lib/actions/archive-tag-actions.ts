'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getFolderTagViews, resolveDiskTagName, type FolderTagsView } from '@/lib/services/archive-tag-service'

type ResolveResult = { success: true; folders: number } | { success: false; error: string }

/**
 * Teach the catalogue an unknown `.pulseboard\#…` name (ADR-0034): the picked tag
 * gains it as an alias (none when the name is the tag's own), and every folder
 * carrying the marker adopts the tag.
 */
export async function resolveDiskTagNameAction(markerRaw: string, tagId: string): Promise<ResolveResult> {
  return withTenantFromHeaders(async () => {
    try {
      const folders = await resolveDiskTagName(markerRaw, { aliasOfTagId: tagId })
      revalidatePath('/archive')
      revalidatePath('/staging-sets')
      revalidatePath('/settings')
      return { success: true, folders }
    } catch (err) {
      console.error('[archive-tags] resolve failed', markerRaw, err)
      return { success: false, error: err instanceof Error ? err.message : 'Could not resolve the marker name' }
    }
  })
}

/** One folder's tag view, for panels that load it on demand (staging slide panel) */
export async function getFolderTagsViewAction(folderId: string): Promise<FolderTagsView | null> {
  return withTenantFromHeaders(async () => (await getFolderTagViews([folderId])).get(folderId) ?? null)
}
