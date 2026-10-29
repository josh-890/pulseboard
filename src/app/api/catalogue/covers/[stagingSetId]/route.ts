import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isAgentAuthorized, resolveAgentTenant } from '@/lib/agent-request'
import { deliverCover } from '@/lib/services/catalogue-cover-service'

const MAX_BYTES = 20 * 1024 * 1024

// Agent endpoint (ADR-0038 S7): one cover found in the catalogue.
// Body: { fileName, data } — data is the file, base64. Decoded strictly; a
// damaged file is refused with the reason and settles the request as FAILED.
export async function POST(request: Request, { params }: { params: Promise<{ stagingSetId: string }> }) {
  if (!isAgentAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { stagingSetId } = await params
  let body: { fileName?: unknown; data?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.fileName !== 'string' || typeof body.data !== 'string') {
    return NextResponse.json({ error: 'fileName and data (base64) are required' }, { status: 400 })
  }
  const data = Buffer.from(body.data, 'base64')
  if (!data.length || data.length > MAX_BYTES) return NextResponse.json({ error: 'Empty or too large' }, { status: 400 })
  const fileName = body.fileName
  return runWithTenant(resolveAgentTenant(request), async () => NextResponse.json(await deliverCover(stagingSetId, fileName, data)))
}
