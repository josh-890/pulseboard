'use server'

import { revalidatePath } from 'next/cache'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  getAllBatches,
  deleteBatch,
  updateItemStatus,
  refreshBatchMatches,
} from '@/lib/services/import/staging-service'
import { prisma } from '@/lib/db'
import { importItem } from '@/lib/services/import/import-executor'
import type { ImportItemStatus } from '@/generated/prisma/client'

type SimpleResult = { success: boolean; error?: string }

export async function getImportBatchesAction() {
  return withTenantFromHeaders(async () => {
    return getAllBatches()
  })
}

export async function deleteImportBatchAction(batchId: string): Promise<SimpleResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteBatch(batchId)
      revalidatePath('/import')
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to delete batch' }
    }
  })
}

export async function updateImportItemStatusAction(
  itemId: string,
  status: ImportItemStatus,
): Promise<SimpleResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateItemStatus(itemId, status)
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to update item status' }
    }
  })
}

export async function importSingleItemAction(
  itemId: string,
): Promise<{ success: boolean; entityId: string | null; error: string | null }> {
  return withTenantFromHeaders(async () => {
    try {
      const item = await prisma.importItem.findUniqueOrThrow({
        where: { id: itemId },
      })

      if (item.status === 'IMPORTED') {
        return { success: true, entityId: item.matchedEntityId, error: null }
      }

      if (item.status === 'BLOCKED') {
        return { success: false, entityId: null, error: item.blockedReason || 'Item is blocked' }
      }

      const result = await importItem(item)

      if (!result.success) {
        await prisma.importItem.update({
          where: { id: itemId },
          data: { status: 'FAILED', blockedReason: result.error },
        })
      }

      return result
    } catch (err) {
      return { success: false, entityId: null, error: String(err) }
    }
  })
}

export async function refreshBatchMatchesAction(
  batchId: string,
): Promise<SimpleResult> {
  return withTenantFromHeaders(async () => {
    try {
      await refreshBatchMatches(batchId)
      revalidatePath(`/import/${batchId}`)
      return { success: true }
    } catch {
      return { success: false, error: 'Failed to refresh matches' }
    }
  })
}
