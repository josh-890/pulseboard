import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getStubWrites } from '@/lib/services/archive-stub-service'

// Agent endpoint (ADR-0032): the scan's write phase pulls the folders whose stub
// flag the app changed and the disk has not followed yet, and creates or removes
// `.pulseboard\STUB` to match. Read-only here; the next Full scan reports what the
// disk then holds and the reconciliation settles it. Same API-key auth as the
// other archive endpoints.
function isAuthorized(request: Request): boolean {
  const apiKey = process.env.ARCHIVE_API_KEY
  if (!apiKey) return false
  return request.headers.get('x-archive-key') === apiKey
}

function resolveTenant(request: Request): string {
  const requested = request.headers.get('x-tenant-id')
  if (requested) return requested
  if (isSingleTenantMode()) return 'default'
  return getAllTenants()[0]?.id ?? 'default'
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runWithTenant(resolveTenant(request), async () => {
    try {
      return NextResponse.json({ writes: await getStubWrites() })
    } catch (err) {
      console.error('[archive/stub-writes] failed:', err)
      return NextResponse.json({ error: 'Failed to load stub writes' }, { status: 500 })
    }
  })
}
