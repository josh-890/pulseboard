import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { transferItem } from '@/lib/services/import/cover-basket-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ basketId: string; itemId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { itemId } = await params
    try {
      const result = await transferItem(itemId)
      return NextResponse.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  })
}
