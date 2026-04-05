import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { importSet } from '@/lib/services/import/import-executor'

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
      if (!stagingSet?.importItemId) {
        return NextResponse.json(
          { error: 'Staging set or linked import item not found' },
          { status: 404 },
        )
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
