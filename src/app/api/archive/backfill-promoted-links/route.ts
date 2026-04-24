import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { backfillPromotedSetArchiveLinks } from '@/lib/services/import/staging-set-service'

/**
 * POST /api/archive/backfill-promoted-links
 *
 * One-time backfill: for every PROMOTED staging set whose archiveFolderId is set
 * but whose promoted Set has no ArchiveFolder.linkedSetId, migrates the link so
 * the set browser and set detail page show the correct archive status.
 */
export async function POST() {
  return withTenantFromHeaders(async () => {
    const result = await backfillPromotedSetArchiveLinks()
    return NextResponse.json(result)
  })
}
