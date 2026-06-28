import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { createBatch } from '@/lib/services/import/staging-service'
import { autoImportBatchCoModels } from '@/lib/services/import/import-executor'

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

      // Co-models (Contacts + claimed collaborations) populate at parse time when
      // the subject Person already exists — i.e. every re-import — so they are not
      // gated behind the ADR-0009 attribute review. For a brand-new subject the
      // person doesn't exist yet, so co-models ride along with the person import
      // instead (handled inside importPerson). Idempotent: a later person import
      // re-runs this and skips already-imported co-models.
      if (batch.subjectIcgId) {
        const subject = await prisma.person.findUnique({
          where: { icgId: batch.subjectIcgId },
          select: { id: true },
        })
        if (subject) await autoImportBatchCoModels(batch.id)
      }

      return NextResponse.json({
        id: batch.id,
        subjectName: batch.subjectName,
        subjectIcgId: batch.subjectIcgId,
        itemCount: batch.items.length,
        stagingSummary: batch.stagingSummary ?? null,
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
