import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getCoverRequest, requestCovers } from '@/lib/services/catalogue-cover-service'

// Opening a staged set without a cover asks the catalogue for it (ADR-0038 S7);
// the answer is where that request stands, for the panel to show.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTenantFromHeaders(async () => {
    const { id } = await params
    try {
      await requestCovers([id], 'opened')
      return NextResponse.json({ request: await getCoverRequest(id) })
    } catch (err) {
      console.error('[cover-request]', err)
      return NextResponse.json({ error: 'Could not ask for the cover' }, { status: 500 })
    }
  })
}
