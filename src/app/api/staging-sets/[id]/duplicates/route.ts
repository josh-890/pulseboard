import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getDuplicateCandidates } from '@/lib/services/import/staging-set-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      const candidates = await getDuplicateCandidates(id)
      return NextResponse.json({ candidates })
    } catch (err) {
      console.error('Staging set duplicates error:', err)
      return NextResponse.json(
        { error: 'Failed to load duplicates' },
        { status: 500 },
      )
    }
  })
}
