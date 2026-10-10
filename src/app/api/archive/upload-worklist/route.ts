import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { getUploadWorklist } from '@/lib/services/archive-upload-service'

// Agent endpoint (archive-upload.ps1, 2026-10-10): promoted photo sets that never
// had images, each with its confirmed archive folder. ?setId= one set, ?limit= N.
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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const setId = url.searchParams.get('setId') || undefined
  const limit = Number(url.searchParams.get('limit')) || undefined
  return runWithTenant(resolveTenant(request), async () => {
    try {
      return NextResponse.json({ sets: await getUploadWorklist({ setId, limit }) })
    } catch (err) {
      console.error('[archive/upload-worklist] failed:', err)
      return NextResponse.json({ error: 'Failed to load the upload worklist' }, { status: 500 })
    }
  })
}
