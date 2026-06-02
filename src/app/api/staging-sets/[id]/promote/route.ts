import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { importSet, promoteManualStagingSet } from '@/lib/services/import/import-executor'
import { recomputeMatchForStagingSet } from '@/lib/services/import/match-refresh-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params

      // Find the staging set and its linked import item
      const stagingSet = await prisma.stagingSet.findUnique({
        where: { id },
        select: { importItemId: true },
      })
      if (!stagingSet) {
        return NextResponse.json(
          { error: 'Staging set not found' },
          { status: 404 },
        )
      }

      // Refresh the cached match against current Set table state before the
      // promote dispatch reads it. The matcher otherwise only re-runs every
      // 24h, so a corrected externalId or a deleted/renamed Set leaves the
      // cached matchedSetId stale. Without this refresh, importSet /
      // promoteManualStagingSet can silently route enrichment into the wrong
      // Set (this exact bug shipped the "Attached → Grecian Sirens" incident
      // on 2026-06-02; recovery via Layer 1 SQL).
      await recomputeMatchForStagingSet(id)

      // Manual staging sets (no ImportItem) use a separate promotion path
      if (!stagingSet.importItemId) {
        const result = await promoteManualStagingSet(id)
        return NextResponse.json(result)
      }

      const importItem = await prisma.importItem.findUnique({
        where: { id: stagingSet.importItemId },
      })
      if (!importItem) {
        return NextResponse.json(
          { error: 'Import item not found' },
          { status: 404 },
        )
      }

      const result = await importSet(importItem)
      return NextResponse.json(result)
    } catch (err) {
      console.error('Staging set promote error:', err)
      return NextResponse.json(
        { success: false, error: 'Failed to promote staging set' },
        { status: 500 },
      )
    }
  })
}
