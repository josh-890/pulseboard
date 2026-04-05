import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getStagingSetStats } from '@/lib/services/import/staging-set-service'

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const url = new URL(request.url)
      const batchId = url.searchParams.get('batchId') || undefined
      const stats = await getStagingSetStats(batchId)
      return NextResponse.json(stats)
    } catch (err) {
      console.error('Staging set stats error:', err)
      return NextResponse.json(
        { error: 'Failed to load stats' },
        { status: 500 },
      )
    }
  })
}
