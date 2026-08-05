import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { setCatalogueAvatar, setCatalogueAvatarError } from '@/lib/services/catalogue-avatar-service'

// Agent endpoint for person portraits from the catalogue. Two shapes, as with the
// archive cover route:
//   image/jpeg | multipart  → the downscaled portrait for this ICG-ID
//   application/json        → { error } when the agent could not read it
// Reporting the failure matters as much as reporting success: a corrupt portrait
// must end up individually nameable, not swallowed into a run that "finished".
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

export async function POST(request: Request, { params }: { params: Promise<{ icgId: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { icgId } = await params
  const contentType = request.headers.get('content-type') ?? ''

  return runWithTenant(resolveTenant(request), async () => {
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
        await setCatalogueAvatarError(icgId, message)
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Bad ICG-ID' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, recorded: 'error' })
    }

    let buffer: Buffer
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
      buffer = Buffer.from(await file.arrayBuffer())
    } else {
      const ab = await request.arrayBuffer()
      if (ab.byteLength === 0) return NextResponse.json({ error: 'Empty body' }, { status: 400 })
      buffer = Buffer.from(ab)
    }

    try {
      const result = await setCatalogueAvatar(icgId, buffer)
      return NextResponse.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Portrait could not be processed'
      if (message.startsWith('Not an ICG-ID')) {
        return NextResponse.json({ error: message }, { status: 400 })
      }
      // Sharp rejected it. 422, not 500 — the request was well-formed, the image
      // was not — and the reason is stored so the file can be found and fixed.
      await setCatalogueAvatarError(icgId, message).catch(() => {})
      return NextResponse.json({ error: message }, { status: 422 })
    }
  })
}
