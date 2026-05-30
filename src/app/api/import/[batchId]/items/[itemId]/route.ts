import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  updateItemStatus,
  updateItemData,
  updateItemDecisions,
} from '@/lib/services/import/staging-service'
import type { ImportItemStatus } from '@/generated/prisma/client'
import type { ImportItemDecisions } from '@/lib/services/import/diff'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string; itemId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { itemId } = await params
      const body = await request.json()

      // ADR-0009: re-import decision saves go through their own service
      // function (auto-transitions status when all decisions are resolved).
      if (body.decisions) {
        const item = await updateItemDecisions(
          itemId,
          body.decisions as ImportItemDecisions,
        )
        return NextResponse.json(item)
      }

      if (body.status) {
        const item = await updateItemStatus(
          itemId,
          body.status as ImportItemStatus,
          body.editedData,
        )
        return NextResponse.json(item)
      }

      if (body.editedData) {
        const item = await updateItemData(itemId, body.editedData)
        return NextResponse.json(item)
      }

      return NextResponse.json(
        { error: 'No valid update fields provided' },
        { status: 400 },
      )
    } catch (err) {
      console.error('Import item update error:', err)
      return NextResponse.json(
        { error: 'Failed to update item' },
        { status: 500 },
      )
    }
  })
}
