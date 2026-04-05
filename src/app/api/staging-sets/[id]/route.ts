import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import {
  getStagingSetById,
  updateStagingSetFields,
  linkStagingSetDuplicate,
} from '@/lib/services/import/staging-set-service'

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

      // Handle duplicate group linking separately
      if (body.duplicateGroupId) {
        const result = await linkStagingSetDuplicate(id, body.duplicateGroupId)
        return NextResponse.json(result)
      }

      // General field update — supports all editable fields
      const result = await updateStagingSetFields(id, body)
      return NextResponse.json(result)
    } catch (err) {
      console.error('Staging set update error:', err)
      return NextResponse.json(
        { error: 'Failed to update staging set' },
        { status: 500 },
      )
    }
  })
}
