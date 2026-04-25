/**
 * GET /api/archive/sidecar/[archiveKey]
 *
 * Returns the JSON content that the external scan script should write into
 * _pulseboard.json for the matched archive folder. This allows the scan script
 * to persist a stable identity file that survives folder moves and drive migrations.
 *
 * archiveKey is now always present on ArchiveFolder (generated at scan time), so this
 * endpoint resolves via ArchiveFolder first and returns folder info even for unlinked
 * folders. setId/stagingSetId are null until a link is confirmed.
 *
 * Protected by the ARCHIVE_API_KEY environment variable.
 */

import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { prisma } from '@/lib/db'
import { ArchiveLinkStatus } from '@/generated/prisma/client'

function isAuthorized(request: Request): boolean {
  const apiKey = process.env.ARCHIVE_API_KEY
  if (!apiKey) return false
  return request.headers.get('x-archive-key') === apiKey
}

function resolveTenant(request: Request): string {
  const requested = request.headers.get('x-tenant-id')
  if (requested) return requested
  if (isSingleTenantMode()) return 'default'
  const tenants = getAllTenants()
  return tenants[0]?.id ?? 'default'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ archiveKey: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = resolveTenant(request)
  return runWithTenant(tenantId, async () => {
    const { archiveKey } = await params

    // Primary lookup: ArchiveFolder (always has archiveKey — generated at scan time)
    const folder = await prisma.archiveFolder.findUnique({
      where: { archiveKey },
      select: {
        folderName: true,
        parsedDate: true,
        scannedAt: true,
        archiveLink: { select: { setId: true, stagingSetId: true, status: true } },
      },
    })

    if (!folder) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const confirmedLink = folder.archiveLink?.status === ArchiveLinkStatus.CONFIRMED
      ? folder.archiveLink
      : null
    const linkedSetId = confirmedLink?.setId ?? null
    const linkedStagingId = confirmedLink?.stagingSetId ?? null

    // Optionally enrich with linked Set/StagingSet metadata (null for unlinked folders)
    const [set, stagingSet] = await Promise.all([
      linkedSetId
        ? prisma.set.findUnique({
            where: { id: linkedSetId },
            select: {
              id: true,
              title: true,
              releaseDate: true,
              channel: { select: { shortName: true } },
            },
          })
        : null,
      linkedStagingId
        ? prisma.stagingSet.findUnique({
            where: { id: linkedStagingId },
            select: {
              id: true,
              title: true,
              releaseDate: true,
              channelName: true,
              channel: { select: { shortName: true } },
            },
          })
        : null,
    ])

    // Return the sidecar content — this is what the scan script writes to _pulseboard.json.
    // folderName is always present. setId/stagingSetId are null for unlinked folders.
    return NextResponse.json({
      archiveKey,
      folderName: folder.folderName,
      setId: linkedSetId,
      stagingSetId: linkedStagingId,
      title: set?.title ?? stagingSet?.title ?? null,
      releaseDate: (set?.releaseDate ?? stagingSet?.releaseDate)?.toISOString().split('T')[0] ?? null,
      channel: set?.channel?.shortName ?? stagingSet?.channel?.shortName ?? stagingSet?.channelName ?? null,
    })
  })
}
