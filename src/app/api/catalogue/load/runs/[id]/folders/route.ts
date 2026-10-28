import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { CatalogueLoadRefused, processFolders } from '@/lib/services/catalogue-load-service'
import type { LoadFolderInput } from '@/lib/services/catalogue-load'

// Agent endpoint (ADR-0038 S3): a batch of catalogue folders for a run. Each
// folder is judged and written on its own — one that fails comes back with
// outcome "failed" and its error, the others are kept.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: { folders?: LoadFolderInput[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(body.folders)) return NextResponse.json({ error: 'Missing folders' }, { status: 400 })
  return runWithTenant(resolveAgentTenant(request), async () => {
    try {
      return NextResponse.json({ results: await processFolders(id, body.folders!) })
    } catch (err) {
      if (err instanceof CatalogueLoadRefused) return NextResponse.json({ error: err.message }, { status: 409 })
      throw err
    }
  })
}
