import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getHdRebakeWorklist } from '@/lib/services/hd-rebake-service'

// Agent endpoint (ADR-0017): the archive re-bake agent pulls the eligible
// worklist for a tenant, reads each original off the local archive, and POSTs
// back the HD bake. Same API-key auth as the scan endpoints.
function isAuthorized(request: Request): boolean {
  const apiKey = process.env.ARCHIVE_API_KEY
  if (!apiKey) return false
  return request.headers.get('x-archive-key') === apiKey
}

function resolveTenant(request: Request): string {
  const requested = request.headers.get('x-tenant-id')
  if (requested) return requested
  if (isSingleTenantMode()) return 'default'
  const tenants = getAllTenants()
  return tenants[0]?.id ?? 'default'
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const personId = url.searchParams.get('personId') ?? undefined
  const sessionId = url.searchParams.get('sessionId') ?? undefined

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    const entries = await getHdRebakeWorklist({ personId, sessionId })
    return NextResponse.json({ count: entries.length, entries })
  })
}
