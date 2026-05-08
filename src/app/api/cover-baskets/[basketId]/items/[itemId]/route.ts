import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { updateItemStatus, deleteItem } from '@/lib/services/import/cover-basket-service'
import type { CoverBasketItemStatus } from '@/generated/prisma/client'

const VALID_STATUSES = new Set<CoverBasketItemStatus>(['PENDING', 'MATCHED', 'IGNORED'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ basketId: string; itemId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { itemId } = await params
    const body = await request.json() as { status?: string; matchedSetId?: string | null }

    if (body.status && !VALID_STATUSES.has(body.status as CoverBasketItemStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const item = await updateItemStatus(
      itemId,
      body.status as CoverBasketItemStatus,
      body.matchedSetId,
    )
    return NextResponse.json(item)
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ basketId: string; itemId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { itemId } = await params
    await deleteItem(itemId)
    return NextResponse.json({ ok: true })
  })
}
