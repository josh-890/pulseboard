import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import {
  addItemsToBasket,
  runMatchingForBasket,
} from '@/lib/services/import/cover-basket-service'
import type { UploadedFile } from '@/lib/services/import/cover-basket-service'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB per file
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ basketId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { basketId } = await params

    const basket = await prisma.coverBasket.findUnique({ where: { id: basketId } })
    if (!basket) {
      return NextResponse.json({ error: 'Basket not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const entries = formData.getAll('files')

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const uploadedFiles: UploadedFile[] = []
    const rejected: string[] = []

    for (const entry of entries) {
      if (!(entry instanceof File)) continue

      if (!ALLOWED_TYPES.has(entry.type)) {
        rejected.push(`${entry.name}: invalid type`)
        continue
      }
      if (entry.size > MAX_SIZE) {
        rejected.push(`${entry.name}: too large (max 20MB)`)
        continue
      }

      const buffer = Buffer.from(await entry.arrayBuffer())
      uploadedFiles.push({
        originalFilename: entry.name,
        buffer,
        fileSize: entry.size,
      })
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'No valid files', rejected }, { status: 400 })
    }

    const items = await addItemsToBasket(basketId, uploadedFiles)
    const matchResult = await runMatchingForBasket(basketId)

    return NextResponse.json({
      added: items.length,
      matched: matchResult.matched,
      pending: matchResult.pending,
      rejected,
    })
  })
}
