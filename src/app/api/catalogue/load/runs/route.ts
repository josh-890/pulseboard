import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { CatalogueLoadRefused, startRun } from '@/lib/services/catalogue-load-service'

// Agent endpoint (ADR-0038 S3): open a catalogue run. Body: { all?: boolean,
// folders: { path, dirIcgId }[] } — the agent's folder index. Answers with the
// run id, its mode (first / changes / all) and the signature of every folder the
// app already holds, so only what changed is sent. 409 when refused (another run
// is running, or the first load has no fresh backup).
export async function POST(request: Request) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { all?: boolean; folders?: { path: string; dirIcgId: string | null }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body.folders)) return NextResponse.json({ error: 'Missing folders' }, { status: 400 })
  return runWithTenant(resolveAgentTenant(request), async () => {
    try {
      return NextResponse.json(await startRun({ all: Boolean(body.all), folders: body.folders! }))
    } catch (err) {
      if (err instanceof CatalogueLoadRefused) return NextResponse.json({ error: err.message }, { status: 409 })
      throw err
    }
  })
}
