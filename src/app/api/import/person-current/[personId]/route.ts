import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { formatPartialDate } from '@/lib/utils'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { toIocCode } from '@/lib/constants/countries'

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
        cosmeticProcedures: {
          where: { attributeDefinitionId: "cattr-breast-size" },
          select: { id: true },
        },
      },
    })

    if (!person) {
      return NextResponse.json({ person: null }, { status: 404 })
    }

    const baselineDeltas = person.eras[0]?.scalarDeltas ?? []
    const deltaFor = (slug: string) =>
      baselineDeltas.find((d) => d.attributeDefinition.slug === slug) ?? null
    const hairDelta = deltaFor("hair_color")
    const breastDelta = deltaFor("breast_size")
    const baseline =
      hairDelta || breastDelta
        ? {
            currentHairColor: hairDelta?.value ?? null,
            breastSize: breastDelta?.value ?? null,
            breastStatus: person.cosmeticProcedures.length > 0
              ? "enhanced"
              : breastDelta
                ? "natural"
                : null,
            breastDescription: breastDelta?.notes ?? null,
          }
        : null

    return NextResponse.json({
      person: {
        icgId: person.icgId,
        birthdate: person.birthdate
          ? formatPartialDate(person.birthdate, person.birthdatePrecision)
          : null,
        nationality: person.nationality
          ? (person.nationality.length === 2 ? toIocCode(person.nationality) : person.nationality)
          : null,
        height: person.height,
        naturalHairColor: person.naturalHairColor,
        naturalBreastSize: person.naturalBreastSize,
        measurements: person.measurements,
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
      baselinePhysical: baseline
        ? {
            currentHairColor: baseline.currentHairColor,
            breastSize: baseline.breastSize,
            breastStatus: baseline.breastStatus,
            breastDescription: baseline.breastDescription,
          }
        : null,
    })
  })
}
