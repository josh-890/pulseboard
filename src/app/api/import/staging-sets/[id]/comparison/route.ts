import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getStagingSetComparison } from '@/lib/services/import/staging-set-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      const comparison = await getStagingSetComparison(id)
      if (!comparison) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json(comparison)
    } catch (err) {
      console.error('Staging set comparison error:', err)
      return NextResponse.json(
        { error: 'Failed to load comparison' },
        { status: 500 },
      )
    }
  })
}
