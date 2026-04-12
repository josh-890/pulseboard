import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { buildExpectedPathForSet } from '@/lib/services/archive-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params
    const path = await buildExpectedPathForSet(id)
    return NextResponse.json({ path })
  })
}
