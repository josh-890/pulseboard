import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { recordAgentPass, type AgentPass } from '@/lib/services/catalogue-cover-service'

// Agent endpoint (ADR-0038 S7): a scheduled pass reports itself, so the runs page
// shows the agent is alive even when nothing changed (an empty pass opens no run).
export async function POST(request: Request) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Partial<AgentPass>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const pass: AgentPass = {
    at: new Date().toISOString(),
    durationMs: n(body.durationMs),
    coversDelivered: n(body.coversDelivered),
    coversNotFound: n(body.coversNotFound),
    coversFailed: n(body.coversFailed),
    foldersSent: n(body.foldersSent),
    runId: typeof body.runId === 'string' ? body.runId : null,
    error: typeof body.error === 'string' ? body.error.slice(0, 500) : null,
  }
  return runWithTenant(resolveAgentTenant(request), async () => {
    await recordAgentPass(pass)
    return NextResponse.json({ ok: true })
  })
}
