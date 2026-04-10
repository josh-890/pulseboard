import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { resolveStagingSetDuplicate } from '@/lib/services/import/staging-set-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      const updated = await resolveStagingSetDuplicate(id)
      return NextResponse.json(updated)
    } catch (err) {
      console.error('Resolve duplicate error:', err)
      return NextResponse.json({ error: 'Failed to resolve duplicate' }, { status: 500 })
    }
  })
}
