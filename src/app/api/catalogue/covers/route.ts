import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { listWantedCovers } from '@/lib/services/catalogue-cover-service'

// Agent endpoint (ADR-0038 S7): the covers the app wants from the catalogue —
// staged set, CoverId, photo or video, and the catalogue folders to look in.
export async function GET(request: Request) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runWithTenant(resolveAgentTenant(request), async () => NextResponse.json({ wanted: await listWantedCovers() }))
}
