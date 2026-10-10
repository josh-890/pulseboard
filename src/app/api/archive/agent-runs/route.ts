import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { recordAgentRun } from '@/lib/services/dashboard-service'

// Agent endpoint (2026-10-11): an agent reports its run at the end — the dashboard's
// "Agents" panel and activity feed. Body { agent, startedAt, ok, dryRun, summary,
// details? }. A failed report must never fail the agent; it just goes unseen.
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

const AGENTS = new Set(['archive-scan', 'archive-cover', 'archive-upload'])

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const agent = typeof body?.agent === 'string' ? body.agent : ''
  const summary = typeof body?.summary === 'string' ? body.summary : ''
  const startedAt = new Date(typeof body?.startedAt === 'string' ? body.startedAt : NaN)
  if (!AGENTS.has(agent) || !summary || Number.isNaN(startedAt.getTime())) {
    return NextResponse.json({ error: 'agent, startedAt and summary required' }, { status: 400 })
  }
  return runWithTenant(resolveTenant(request), async () => {
    try {
      await recordAgentRun({
        agent,
        startedAt,
        ok: body?.ok !== false,
        dryRun: body?.dryRun === true,
        summary,
        details: body?.details,
      })
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[archive/agent-runs] failed:', err)
      return NextResponse.json({ error: 'Failed to record the run' }, { status: 500 })
    }
  })
}
