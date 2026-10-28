import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getCatalogueInventoryContext } from '@/lib/services/catalogue-inventory-context-service'

// Agent endpoint (ADR-0038). READ-ONLY: the catalogue-inventory agent judges the
// person catalogue on its own machine and needs to know what the app already
// holds — Persons, Contacts, portraits, staged casts — to report the overlap and
// the payoff. Nothing is written.
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
    return NextResponse.json(await getCatalogueInventoryContext())
  })
}
