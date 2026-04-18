import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { markGhostFolders } from '@/lib/services/archive-service'

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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    let body: { scanStartedAt?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!body.scanStartedAt) {
      return NextResponse.json({ error: 'Missing scanStartedAt' }, { status: 400 })
    }

    const scanStartedAt = new Date(body.scanStartedAt)
    if (isNaN(scanStartedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid scanStartedAt timestamp' }, { status: 400 })
    }

    const { marked } = await markGhostFolders(scanStartedAt, tenantId)
    return NextResponse.json({ ok: true, marked })
  })
}
