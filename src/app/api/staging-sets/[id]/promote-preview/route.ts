import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { previewStagingSetPromote } from '@/lib/services/import/import-executor'
import { recomputeMatchForStagingSet } from '@/lib/services/import/match-refresh-service'

// What promoting this staging set would do — new Set or enrich an existing
// one — without promoting. Refreshes the cached match first, exactly like the
// promote route, so the preview and the real promote read the same match.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      await recomputeMatchForStagingSet(id)
      const preview = await previewStagingSetPromote(id)
      return NextResponse.json(preview)
    } catch (err) {
      console.error('Staging set promote preview error:', err)
      return NextResponse.json(
        { kind: 'not-promotable', reason: 'Failed to load the promote preview' },
        { status: 500 },
      )
    }
  })
}
