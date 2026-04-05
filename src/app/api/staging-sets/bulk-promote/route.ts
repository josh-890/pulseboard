import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { importSet } from '@/lib/services/import/import-executor'

export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const { ids } = (await request.json()) as { ids: string[] }

      if (!ids?.length) {
        return NextResponse.json(
          { error: 'ids are required' },
          { status: 400 },
        )
      }

      const succeeded: string[] = []
      const failed: Array<{ id: string; error: string }> = []

      for (const id of ids) {
        try {
          const stagingSet = await prisma.stagingSet.findUnique({
            where: { id },
            select: { importItemId: true },
          })
          if (!stagingSet?.importItemId) {
            failed.push({ id, error: 'No linked import item' })
            continue
          }

          const importItem = await prisma.importItem.findUnique({
            where: { id: stagingSet.importItemId },
          })
          if (!importItem) {
            failed.push({ id, error: 'Import item not found' })
            continue
          }

          const result = await importSet(importItem)
          if (result.success) {
            succeeded.push(id)
          } else {
            failed.push({ id, error: result.error ?? 'Unknown error' })
          }
        } catch (err) {
          failed.push({ id, error: String(err) })
        }
      }

      return NextResponse.json({ succeeded, failed })
    } catch (err) {
      console.error('Bulk promote error:', err)
      return NextResponse.json(
        { error: 'Failed to bulk promote' },
        { status: 500 },
      )
    }
  })
}
