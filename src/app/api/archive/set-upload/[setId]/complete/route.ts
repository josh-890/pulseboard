import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { completeArchiveUpload } from '@/lib/services/archive-upload-service'

// Agent endpoint (archive-upload.ps1): the agent went through every file of the
// set. Body { failed: string[] } — the file names it could not upload; kept on the
// set so they stay visible. The set leaves the queue either way.
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

export async function POST(request: Request, { params }: { params: Promise<{ setId: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { setId } = await params
  const body: unknown = await request.json().catch(() => ({}))
  const failedRaw = body && typeof body === 'object' && 'failed' in body ? (body as { failed: unknown }).failed : []
  // PowerShell's ConvertTo-Json collapses a one-element array into a scalar
  const failed = (Array.isArray(failedRaw) ? failedRaw : failedRaw ? [failedRaw] : []).map(String)
  return runWithTenant(resolveTenant(request), async () => {
    try {
      await completeArchiveUpload(setId, failed)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[archive/set-upload/complete] failed:', setId, err)
      return NextResponse.json({ error: 'Failed to complete' }, { status: 500 })
    }
  })
}
