import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getAttributionWorklist } from '@/lib/services/attribution-worklist-service'

// Agent endpoint (ADR-0027, plan slice 0). READ-ONLY: the catalogue-join agent
// pulls the archive side of the join, matches it against the person catalogue on
// its own machine, and prints a report. Nothing is posted back and nothing is
// created — this slice exists to decide whether slices 4-6 are worth building.
//
// The payload carries two things:
//   orphans     — the folders the join is meant to explain
//   groundTruth — folders already linked to a set whose participants are known,
//                 so the agent can measure RECALL against pairs the app already
//                 knows the answer to, rather than reporting a hit rate with
//                 nothing to check it against.
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
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50000) : undefined

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    const payload = await getAttributionWorklist({ limit })
    return NextResponse.json(payload)
  })
}
