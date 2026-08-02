import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import {
  setArchiveFolderCover,
  setArchiveFolderCoverError,
} from '@/lib/services/archive-cover-service'

// Agent endpoint (plan slice 1). Two shapes on the same route:
//   image/jpeg          → the downscaled thumbnail for this folder
//   application/json    → { error } when the agent could not read/decode the image
// Reporting the failure is as much the point as reporting success: a corrupt
// image has to end up individually visible in the workspace, not swallowed.
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ archiveKey: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { archiveKey } = await params
  const contentType = request.headers.get('content-type') ?? ''
  const tenantId = resolveTenant(request)

  return runWithTenant(tenantId, async () => {
    // ── Failure report ───────────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      let body: { error?: string }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }
      const message = (body.error ?? '').trim()
      if (!message) return NextResponse.json({ error: 'Missing error' }, { status: 400 })
      try {
        await setArchiveFolderCoverError(archiveKey, message)
      } catch {
        return NextResponse.json({ error: 'Archive folder not found' }, { status: 404 })
      }
      return NextResponse.json({ ok: true, recorded: 'error' })
    }

    // ── Thumbnail ────────────────────────────────────────────────────────────
    let buffer: Buffer
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Missing file' }, { status: 400 })
      }
      buffer = Buffer.from(await file.arrayBuffer())
    } else {
      const ab = await request.arrayBuffer()
      if (ab.byteLength === 0) {
        return NextResponse.json({ error: 'Empty body' }, { status: 400 })
      }
      buffer = Buffer.from(ab)
    }

    try {
      const result = await setArchiveFolderCover(archiveKey, buffer)
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cover could not be processed'
      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 })
      }
      // Sharp rejected it — record it against the folder so the operator sees
      // WHICH folder is bad, then tell the agent. 422, not 500: the request was
      // well-formed, the image was not.
      await setArchiveFolderCoverError(archiveKey, message).catch(() => {})
      return NextResponse.json({ error: message }, { status: 422 })
    }
  })
}
