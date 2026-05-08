import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { transferAllMatched } from '@/lib/services/import/cover-basket-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ basketId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { basketId } = await params
    const result = await transferAllMatched(basketId)
    return NextResponse.json(result)
  })
}
