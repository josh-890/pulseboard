import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getBatch, deleteBatch } from '@/lib/services/import/staging-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { batchId } = await params
      const batch = await getBatch(batchId)
      return NextResponse.json(batch)
    } catch (err) {
      console.error('Import batch fetch error:', err)
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 },
      )
    }
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { batchId } = await params
      await deleteBatch(batchId)
      return NextResponse.json({ success: true })
    } catch (err) {
      console.error('Import batch delete error:', err)
      return NextResponse.json(
        { error: 'Failed to delete batch' },
        { status: 500 },
      )
    }
  })
}
