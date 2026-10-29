import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { getKnownFolders } from '@/lib/services/catalogue-load-service'

// Agent endpoint (ADR-0038 S7): the signature of every folder held, without
// opening a run — the scheduled pass opens one only when something changed.
export async function GET(request: Request) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runWithTenant(resolveAgentTenant(request), async () => NextResponse.json(await getKnownFolders()))
}
