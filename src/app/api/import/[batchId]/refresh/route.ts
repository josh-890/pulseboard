import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { refreshBatchMatches } from '@/lib/services/import/staging-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { batchId } = await params
      const batch = await refreshBatchMatches(batchId)
      return NextResponse.json(batch)
    } catch (err) {
      console.error('Import refresh error:', err)
      return NextResponse.json(
        { error: 'Failed to refresh matches' },
        { status: 500 },
      )
    }
  })
}
