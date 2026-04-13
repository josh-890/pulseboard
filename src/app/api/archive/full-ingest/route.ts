import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { upsertArchiveFolders, runMatchingPass } from '@/lib/services/archive-service'
import type { FullIngestItem } from '@/lib/services/archive-service'

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
    let items: FullIngestItem[]
    try {
      items = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Expected array of folder items' }, { status: 400 })
    }

    const { upserted } = await upsertArchiveFolders(items, tenantId)

    // Run matching pass asynchronously — do not block the response
    // The client gets an immediate acknowledgement; matching runs in the background
    runMatchingPass(tenantId).catch((err) => {
      console.error('[archive/full-ingest] matching pass failed:', err)
    })

    return NextResponse.json({ ok: true, upserted })
  })
}
