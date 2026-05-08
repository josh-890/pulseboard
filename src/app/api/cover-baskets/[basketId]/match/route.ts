import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { runMatchingForBasket } from '@/lib/services/import/cover-basket-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ basketId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { basketId } = await params
    const result = await runMatchingForBasket(basketId)
    return NextResponse.json(result)
  })
}
