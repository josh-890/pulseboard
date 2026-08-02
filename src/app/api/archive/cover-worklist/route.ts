import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getCoverWorklist, getCoverStats } from '@/lib/services/archive-cover-service'

// Agent endpoint (plan slice 1): the cover agent pulls the folders that still
// need a thumbnail, reads one image off the local archive, downscales it and
// POSTs the result to /api/archive/cover/[archiveKey]. Same API-key auth as the
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

  const url = new URL(request.url)
  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20000) : undefined
  // Folders with a recorded failure are skipped by default so a routine re-run
  // does not grind through known-bad images; --retry-failed opts back in.
  const retryFailed = url.searchParams.get('retryFailed') === '1'
  const pathPrefix = url.searchParams.get('path') ?? undefined

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    const [entries, stats] = await Promise.all([
      getCoverWorklist({ limit, retryFailed, pathPrefix }),
      getCoverStats(),
    ])
    return NextResponse.json({ count: entries.length, stats, entries })
  })
}
