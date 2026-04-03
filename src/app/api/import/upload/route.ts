import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { createBatch } from '@/lib/services/import/staging-service'

export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    try {
      const formData = await request.formData()
      const file = formData.get('file')

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 },
        )
      }

      const rawContent = await file.text()
      if (!rawContent.trim()) {
        return NextResponse.json(
          { error: 'File is empty' },
          { status: 400 },
        )
      }

      const batch = await createBatch(file.name, rawContent)

      return NextResponse.json({
        id: batch.id,
        subjectName: batch.subjectName,
        subjectIcgId: batch.subjectIcgId,
        itemCount: batch.items.length,
      })
    } catch (err) {
      console.error('Import upload error:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Upload failed' },
        { status: 500 },
      )
    }
  })
}
