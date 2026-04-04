import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { formatPartialDate } from '@/lib/utils'
import { withTenantFromHeaders } from '@/lib/tenant-context'

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
        personas: {
          where: { isBaseline: true },
          include: { physicalChange: true },
          take: 1,
        },
      },
    })

    if (!person) {
      return NextResponse.json({ person: null }, { status: 404 })
    }

    const baseline = person.personas[0]?.physicalChange ?? null

    return NextResponse.json({
      person: {
        icgId: person.icgId,
        birthdate: person.birthdate
          ? formatPartialDate(person.birthdate, person.birthdatePrecision)
          : null,
        nationality: person.nationality,
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
