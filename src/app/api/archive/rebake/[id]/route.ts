import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { isSingleTenantMode, getAllTenants } from '@/lib/tenants'
import { prisma } from '@/lib/db'
import { uploadPhotoToStorage } from '@/lib/media-upload'
import type { PhotoVariants } from '@/lib/types'

// Agent endpoint (ADR-0017): the archive re-bake agent POSTs the HD bake (sampled
// from the archive original) for one Aligned image. We regenerate variants under
// FRESH keys (cache-bust), overwrite the Aligned MediaItem in place, and flip its
// bakeSource to ORIGINAL. Same identity, sharper pixels — every link/representative
// /collection reference stays valid. Same API-key auth as the scan endpoints.
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
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  const buffer = Buffer.from(await file.arrayBuffer())

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    const target = await prisma.mediaItem.findUnique({
      where: { id },
      select: { id: true, motifTemplateId: true, motifProvenance: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Aligned image not found' }, { status: 404 })
    }
    // Guard: only Aligned images are re-bakeable (ADR-0013 identity).
    if (!target.motifTemplateId) {
      return NextResponse.json({ error: 'Not an Aligned image' }, { status: 400 })
    }

    // Fresh prefix → new MinIO keys → the unchanged image URL serves the new bake
    // without a stale cache hit. Old variant blobs are left orphaned (storage GC).
    let result
    try {
      result = await uploadPhotoToStorage(buffer, 'image/jpeg', 'rebake', id, String(Date.now()))
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Bake could not be processed' },
        { status: 422 },
      )
    }

    const prevProvenance =
      target.motifProvenance && typeof target.motifProvenance === 'object'
        ? (target.motifProvenance as Record<string, unknown>)
        : {}

    await prisma.mediaItem.update({
      where: { id },
      data: {
        variants: result.variants as unknown as Record<string, string>,
        size: buffer.length,
        originalWidth: result.originalWidth,
        originalHeight: result.originalHeight,
        bakeSource: 'ORIGINAL',
        motifProvenance: { ...prevProvenance, hdBakedAt: new Date().toISOString() },
      },
    })

    const variants = result.variants as PhotoVariants
    return NextResponse.json({
      success: true,
      mediaItemId: id,
      width: result.originalWidth,
      height: result.originalHeight,
      master: variants.master_4000 ?? null,
    })
  })
}
