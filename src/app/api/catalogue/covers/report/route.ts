import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { reportCoversNotFound } from '@/lib/services/catalogue-cover-service'

// Agent endpoint (ADR-0038 S7): covers looked for and not found.
// Body: { notFound: [{ stagingSetId, detail }] }
export async function POST(request: Request) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { notFound?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const items = Array.isArray(body.notFound)
    ? body.notFound.filter(
        (x): x is { stagingSetId: string; detail: string } =>
          !!x && typeof x === 'object' && typeof (x as { stagingSetId?: unknown }).stagingSetId === 'string',
      ).map((x) => ({ stagingSetId: x.stagingSetId, detail: typeof x.detail === 'string' ? x.detail : 'not found' }))
    : []
  return runWithTenant(resolveAgentTenant(request), async () => NextResponse.json({ settled: await reportCoversNotFound(items) }))
}
