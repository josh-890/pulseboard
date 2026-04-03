import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { importItem } from '@/lib/services/import/import-executor'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string; itemId: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { itemId } = await params
      const item = await prisma.importItem.findUniqueOrThrow({
        where: { id: itemId },
      })

      if (item.status === 'IMPORTED') {
        return NextResponse.json({
          success: true,
          entityId: item.matchedEntityId,
          error: null,
          alreadyImported: true,
        })
      }

      if (item.status === 'BLOCKED') {
        return NextResponse.json(
          {
            success: false,
            entityId: null,
            error: item.blockedReason || 'Item is blocked by unresolved dependencies',
          },
          { status: 409 },
        )
      }

      const result = await importItem(item)

      if (!result.success) {
        // Mark as failed
        await prisma.importItem.update({
          where: { id: itemId },
          data: { status: 'FAILED', blockedReason: result.error },
        })
        return NextResponse.json(result, { status: 422 })
      }

      return NextResponse.json(result)
    } catch (err) {
      console.error('Import item execution error:', err)
      return NextResponse.json(
        { success: false, entityId: null, error: String(err) },
        { status: 500 },
      )
    }
  })
}
