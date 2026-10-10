import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { uploadArchiveImage } from '@/lib/services/archive-upload-service'

// Agent endpoint (archive-upload.ps1): one archive image into its set. The body is
// the raw file (Content-Type image/*); ?filename= and ?sortOrder= describe it.
// 200 with { status } — uploaded, skipped (already in the set) or refused — so the
// agent can tell "go on" from "this file failed"; 500 only for a real error
// (e.g. an image Sharp cannot decode), which the agent reports per file.
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

const MAX_BYTES = 100 * 1024 * 1024

export async function POST(request: Request, { params }: { params: Promise<{ setId: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { setId } = await params
  const url = new URL(request.url)
  const filename = url.searchParams.get('filename') ?? ''
  const sortOrder = Number(url.searchParams.get('sortOrder') ?? '0') || 0
  const mimeType = (request.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })

  const buffer = Buffer.from(await request.arrayBuffer())
  if (buffer.length === 0) return NextResponse.json({ error: 'empty body' }, { status: 400 })
  if (buffer.length > MAX_BYTES) return NextResponse.json({ status: 'refused', reason: 'larger than 100 MB' })

  return runWithTenant(resolveTenant(request), async () => {
    try {
      return NextResponse.json(await uploadArchiveImage({ setId, filename, mimeType, sortOrder, buffer }))
    } catch (err) {
      console.error('[archive/set-upload] failed:', setId, filename, err)
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 })
    }
  })
}
