import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { finishRun } from '@/lib/services/catalogue-load-service'

// Agent endpoint (ADR-0038 S3): close a run. Body: { seenPaths: string[] | null }
// — every folder the agent found (a held folder not among them is marked gone),
// or null for a limited run that saw only part of the catalogue.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: { seenPaths?: string[] | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  return runWithTenant(resolveAgentTenant(request), async () =>
    NextResponse.json({ counts: await finishRun(id, Array.isArray(body.seenPaths) ? body.seenPaths : null) }),
  )
}
