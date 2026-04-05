import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getStagingSetsForBatch } from '@/lib/services/import/staging-set-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { batchId } = await params
      const stagingSets = await getStagingSetsForBatch(batchId)
      return NextResponse.json(stagingSets)
    } catch (err) {
      console.error('Staging sets list error:', err)
      return NextResponse.json(
        { error: 'Failed to load staging sets' },
        { status: 500 },
      )
    }
  })
}
