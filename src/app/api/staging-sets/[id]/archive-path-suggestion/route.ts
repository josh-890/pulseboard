import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { buildExpectedPathForStagingSet } from '@/lib/services/archive-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { id } = await params
    const path = await buildExpectedPathForStagingSet(id)
    return NextResponse.json({ path })
  })
}
