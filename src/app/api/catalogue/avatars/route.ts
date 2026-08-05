import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { listCatalogueAvatarIds, getCatalogueAvatarStats } from '@/lib/services/catalogue-avatar-service'

// Which portraits the app already holds, so a re-run uploads only what is new.
// ~39k short strings is well under a megabyte in one response, and far cheaper
// than the agent asking per person.
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
    const [icgIds, stats] = await Promise.all([listCatalogueAvatarIds(), getCatalogueAvatarStats()])
    return NextResponse.json({ stats, icgIds })
  })
}
