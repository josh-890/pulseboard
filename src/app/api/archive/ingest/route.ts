import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { ingestScanResults } from '@/lib/services/archive-service'
import type { ScanResult } from '@/lib/services/archive-service'

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
    let results: ScanResult[]
    try {
      results = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!Array.isArray(results)) {
      return NextResponse.json({ error: 'Expected array of scan results' }, { status: 400 })
    }

    await ingestScanResults(results)
    return NextResponse.json({ ok: true, count: results.length })
  })
}
