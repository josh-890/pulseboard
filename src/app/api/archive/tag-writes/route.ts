import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getTagWrites } from '@/lib/services/archive-tag-service'

// Agent endpoint (ADR-0034): the scan's write phase pulls the folders whose tags
// changed in the app since the disk was last read, each with the complete set of
// `.pulseboard\#…` marker names it should hold. The agent creates and deletes `#`
// files to match; the next Full scan confirms. Same API-key auth as stub-writes.
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
      return NextResponse.json({ writes: await getTagWrites() })
    } catch (err) {
      console.error('[archive/tag-writes] failed:', err)
      return NextResponse.json({ error: 'Failed to load tag writes' }, { status: 500 })
    }
  })
}
