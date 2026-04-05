import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { bulkUpdateStatus } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'

export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const { ids, status } = (await request.json()) as {
        ids: string[]
        status: StagingSetStatus
      }

      if (!ids?.length || !status) {
        return NextResponse.json(
          { error: 'ids and status are required' },
          { status: 400 },
        )
      }

      const count = await bulkUpdateStatus(ids, status)
      return NextResponse.json({ success: true, count })
    } catch (err) {
      console.error('Bulk update error:', err)
      return NextResponse.json(
        { error: 'Failed to bulk update' },
        { status: 500 },
      )
    }
  })
}
