import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getStagingSetById, updateStagingSetStatus, linkStagingSetDuplicate } from '@/lib/services/import/staging-set-service'
import type { StagingSetStatus } from '@/generated/prisma/client'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      const stagingSet = await getStagingSetById(id)
      if (!stagingSet) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      return NextResponse.json(stagingSet)
    } catch (err) {
      console.error('Staging set get error:', err)
      return NextResponse.json(
        { error: 'Failed to load staging set' },
        { status: 500 },
      )
    }
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      const body = await request.json()

      if (body.duplicateGroupId) {
        const result = await linkStagingSetDuplicate(id, body.duplicateGroupId)
        return NextResponse.json(result)
      }

      if (body.status) {
        const result = await updateStagingSetStatus(
          id,
          body.status as StagingSetStatus,
          body.notes,
        )
        return NextResponse.json(result)
      }

      return NextResponse.json({ error: 'No action specified' }, { status: 400 })
    } catch (err) {
      console.error('Staging set update error:', err)
      return NextResponse.json(
        { error: 'Failed to update staging set' },
        { status: 500 },
      )
    }
  })
}
