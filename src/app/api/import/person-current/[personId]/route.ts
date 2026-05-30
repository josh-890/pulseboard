import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { formatPartialDate } from '@/lib/utils'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { toIocCode } from '@/lib/constants/countries'

// Returns the matched person's current state in a shape aligned with the
// import comparison grid + ADR-0009 re-import review. The legacy
// `naturalHairColor` / `naturalBreastSize` / `breastPhysical` aliases were
// dropped — they fabricated old Person columns from baseline-Era ScalarDeltas
// and made the grid look like it was tracking two separate concepts.
// Today every catalog-backed attribute is keyed by slug under
// `baselineAttributes`.

type BaselineAttribute = {
  value: string | null
  isVerifiedUnknown: boolean
  notes: string | null
  // From PersonCurrentState.attributeStatuses — only populated for
  // statusBearing definitions (currently only `breast_size`). Drives the
  // Natural/Enhanced/Restored pill in the grid.
  attributeStatus: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { personId } = await params

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        aliases: { where: { isCommon: true }, take: 1 },
        eras: {
          where: { isBaseline: true },
          include: {
            scalarDeltas: { include: { attributeDefinition: { select: { slug: true } } } },
          },
          take: 1,
        },
        currentState: { select: { attributeStatuses: true } },
      },
    })

    if (!person) {
      return NextResponse.json({ person: null }, { status: 404 })
    }

    const baselineDeltas = person.eras[0]?.scalarDeltas ?? []
    const statusMap =
      (person.currentState?.attributeStatuses as Record<string, string> | null) ?? {}

    const baselineAttributes: Record<string, BaselineAttribute> = {}
    for (const delta of baselineDeltas) {
      const slug = delta.attributeDefinition.slug
      baselineAttributes[slug] = {
        value: delta.value || null,
        isVerifiedUnknown: delta.isVerifiedUnknown,
        notes: delta.notes,
        attributeStatus: statusMap[slug] ?? null,
      }
    }

    return NextResponse.json({
      person: {
        icgId: person.icgId,
        birthdate: person.birthdate
          ? formatPartialDate(person.birthdate, person.birthdatePrecision)
          : null,
        nationality: person.nationality
          ? (person.nationality.length === 2 ? toIocCode(person.nationality) : person.nationality)
          : null,
        // Height intentionally dropped from the legacy `person` shape —
        // it's a no-op column since Phase G Slice 3a. Consumers read it
        // via baselineAttributes['height'] now.
        activeFrom: person.activeFrom
          ? formatPartialDate(person.activeFrom, person.activeFromPrecision)
          : null,
        retiredAt: person.retiredAt
          ? formatPartialDate(person.retiredAt, person.retiredAtPrecision)
          : null,
        bio: person.bio,
        status: person.status,
      },
      commonAlias: person.aliases[0]?.name ?? null,
      baselineAttributes,
    })
  })
}
