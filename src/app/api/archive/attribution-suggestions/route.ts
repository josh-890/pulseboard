import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import {
  ingestSuggestions,
  getSuggestionStats,
  parseSuggestionBatch,
} from '@/lib/services/attribution-suggestion-service'

// Agent endpoint (ADR-0027, plan slice 4). The catalogue-join agent posts what it
// proposes; the app stores it and materialises NOTHING — no set, no participant,
// no contact. Confirmation (slice 5) is the only door into the database, which is
// what makes it safe to re-run the agent as often as the catalogue changes.
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseSuggestionBatch(body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    const result = await ingestSuggestions(parsed.source, parsed.suggestions)
    return NextResponse.json({ ok: true, ...result, stats: await getSuggestionStats() })
  })
}
