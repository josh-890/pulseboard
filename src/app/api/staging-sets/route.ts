import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getStagingSetsFiltered } from '@/lib/services/import/staging-set-service'
import type { ChannelTier, StagingSetStatus } from '@/generated/prisma/client'

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const url = new URL(request.url)

      const statusParam = url.searchParams.get('status')
      const status = statusParam
        ? (statusParam.split(',') as StagingSetStatus[])
        : undefined

      const priorityParam = url.searchParams.get('priority')
      const priority = priorityParam
        ? priorityParam.split(',').map(Number)
        : undefined

      const channelTierParam = url.searchParams.get('channelTier')
      const channelTier = channelTierParam
        ? (channelTierParam.split(',') as ChannelTier[])
        : undefined

      const isVideoParam = url.searchParams.get('isVideo')
      const isVideo = isVideoParam === 'true' ? true : isVideoParam === 'false' ? false : undefined
      const noDate = url.searchParams.get('noDate') === 'true' || undefined

      const showDuplicates = url.searchParams.get('showDuplicates') === 'true' || undefined

      const result = await getStagingSetsFiltered({
        status,
        hasMatch: url.searchParams.get('hasMatch') === 'true'
          ? true
          : url.searchParams.get('hasMatch') === 'false'
            ? false
            : undefined,
        matchType: (url.searchParams.get('matchType') as 'exact' | 'probable') || undefined,
        showDuplicates,
        isVideo,
        noDate,
        personId: url.searchParams.get('personId') || undefined,
        channelId: url.searchParams.get('channelId') || undefined,
        channelTier,
        dateFrom: url.searchParams.get('dateFrom') || undefined,
        dateTo: url.searchParams.get('dateTo') || undefined,
        batchId: url.searchParams.get('batchId') || undefined,
        priority,
        search: url.searchParams.get('search') || undefined,
        sort: (url.searchParams.get('sort') as 'date' | 'title' | 'priority' | 'importDate' | 'undatedFirst') || undefined,
        sortDir: (url.searchParams.get('sortDir') as 'asc' | 'desc') || undefined,
        cursor: url.searchParams.get('cursor') || undefined,
        offset: url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined,
        limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
      })

      return NextResponse.json(result)
    } catch (err) {
      console.error('Staging sets list error:', err)
      return NextResponse.json(
        { error: 'Failed to load staging sets' },
        { status: 500 },
      )
    }
  })
}
