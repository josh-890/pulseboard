import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import { updateSetRecord } from '@/lib/services/set-service'
import { getStagingSetComparison } from '@/lib/services/import/staging-set-service'

const ALLOWED_FIELDS = ['imageCount', 'description', 'externalId', 'artist'] as const
type ApplyField = (typeof ALLOWED_FIELDS)[number]

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withTenantFromHeaders(async () => {
    try {
      const { id } = await params
      const body = await request.json()
      const field = body.field as string
      const matchedSetId = body.matchedSetId as string

      if (!field || !matchedSetId) {
        return NextResponse.json({ error: 'field and matchedSetId required' }, { status: 400 })
      }
      if (!ALLOWED_FIELDS.includes(field as ApplyField)) {
        return NextResponse.json({ error: `Invalid field: ${field}` }, { status: 400 })
      }

      // Load staging set to get import value
      const stagingSet = await prisma.stagingSet.findUnique({ where: { id } })
      if (!stagingSet) {
        return NextResponse.json({ error: 'Staging set not found' }, { status: 404 })
      }

      // Apply the field
      switch (field) {
        case 'imageCount':
          if (stagingSet.imageCount != null) {
            await updateSetRecord(matchedSetId, { imageCount: stagingSet.imageCount })
          }
          break
        case 'description':
          if (stagingSet.description) {
            await updateSetRecord(matchedSetId, { description: stagingSet.description })
          }
          break
        case 'externalId':
          if (stagingSet.externalId) {
            await updateSetRecord(matchedSetId, { externalId: stagingSet.externalId })
          }
          break
        case 'artist':
          if (stagingSet.artist) {
            // Create an UNRESOLVED credit row
            await prisma.setCreditRaw.create({
              data: {
                setId: matchedSetId,
                rawName: stagingSet.artist,
                nameNorm: normalizeForSearch(stagingSet.artist),
                resolutionStatus: 'UNRESOLVED',
              },
            })
          }
          break
      }

      // Return refreshed comparison
      const comparison = await getStagingSetComparison(id)
      return NextResponse.json(comparison)
    } catch (err) {
      console.error('Apply field error:', err)
      return NextResponse.json(
        { error: 'Failed to apply field' },
        { status: 500 },
      )
    }
  })
}
