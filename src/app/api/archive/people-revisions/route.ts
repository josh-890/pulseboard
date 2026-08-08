/**
 * GET /api/archive/people-revisions
 *
 * One fingerprint per archive folder, so the scan agent can tell in a single round
 * trip which `_pulseboard_people.txt` files are out of date (ADR-0029). Folders the
 * app knows nobody for carry the sentinel `EMPTY`: the agent deletes their file
 * rather than leaving a stale one behind.
 *
 * Protected by the ARCHIVE_API_KEY environment variable.
 */
import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getPeopleRevisions } from '@/lib/services/archive-people-service'

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
    const revisions = await getPeopleRevisions()
    return NextResponse.json({ count: revisions.length, revisions })
  })
}
