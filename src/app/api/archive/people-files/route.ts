/**
 * POST /api/archive/people-files   { archiveKeys: string[] }
 *
 * The rendered `_pulseboard_people.txt` bodies for the folders whose fingerprint
 * differs from what is on disk (ADR-0029). A `null` body means the app knows nobody
 * there and the agent should remove the file.
 *
 * POST rather than GET because the agent asks for keys in batches, and a few hundred
 * UUIDs in a query string is a fragile way to ask anything.
 *
 * Protected by the ARCHIVE_API_KEY environment variable.
 */
import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getPeopleFiles } from '@/lib/services/archive-people-service'

/** One request should stay a request: the agent batches, and so does this guard. */
const MAX_KEYS = 500

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

  let body: { archiveKeys?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const keys = body.archiveKeys
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) {
    return NextResponse.json({ error: 'Expected { archiveKeys: string[] }' }, { status: 400 })
  }
  if (keys.length > MAX_KEYS) {
    return NextResponse.json({ error: `At most ${MAX_KEYS} keys per request` }, { status: 400 })
  }

  return runWithTenant(resolveTenant(request), async () => {
    const files = await getPeopleFiles(keys as string[])
    return NextResponse.json({ files })
  })
}
