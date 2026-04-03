import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { updateItemStatus, updateItemData } from '@/lib/services/import/staging-service'
import type { ImportItemStatus } from '@/generated/prisma/client'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string; itemId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { itemId } = await params
      const body = await request.json()

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
