/**
 * GET /api/archive/sidecar/[archiveKey]
 *
 * Returns the JSON content that the external scan script should write into
 * _pulseboard.json for the matched archive folder. This allows the scan script
 * to persist a stable identity file that survives folder moves and drive migrations.
 *
 * Protected by the ARCHIVE_API_KEY environment variable.
 */

import { NextResponse } from 'next/server'
import { runWithTenant } from '@/lib/tenant-context'
import { getAllTenants, isSingleTenantMode } from '@/lib/tenants'
import { prisma } from '@/lib/db'

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

    // Look up the Set or StagingSet that owns this archiveKey
    const [set, stagingSet] = await Promise.all([
      prisma.set.findUnique({
        where: { archiveKey },
        select: {
          id: true,
          title: true,
          releaseDate: true,
          channel: { select: { name: true, shortName: true } },
        },
      }),
      prisma.stagingSet.findUnique({
        where: { archiveKey },
        select: {
          id: true,
          title: true,
          releaseDate: true,
          channelName: true,
          channel: { select: { name: true, shortName: true } },
        },
      }),
    ])

    if (!set && !stagingSet) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Return the sidecar content — this is what the scan script writes to _pulseboard.json
    const sidecar = {
      archiveKey,
      setId: set?.id ?? null,
      stagingSetId: stagingSet?.id ?? null,
      title: set?.title ?? stagingSet?.title ?? null,
      releaseDate: (set?.releaseDate ?? stagingSet?.releaseDate)?.toISOString().split('T')[0] ?? null,
      channel: set?.channel?.shortName ?? stagingSet?.channel?.shortName ?? stagingSet?.channelName ?? null,
    }

    return NextResponse.json(sidecar)
  })
}
