import { type NextRequest, NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10), 50)

  return withTenantFromHeaders(async () => {
    const where = q ? { title: { contains: q, mode: 'insensitive' as const } } : {}

    const [sets, stagingSets] = await Promise.all([
      prisma.set.findMany({
        where,
        select: { id: true, title: true, releaseDate: true, channel: { select: { name: true } } },
        orderBy: { releaseDate: 'desc' },
        take: limit,
      }),
      prisma.stagingSet.findMany({
        where: { ...where, status: { not: 'PROMOTED' } },
        select: { id: true, title: true, releaseDate: true, channelName: true },
        orderBy: { releaseDate: 'desc' },
        take: limit,
      }),
    ])

    const results = [
      ...sets.map((s) => ({
        id: s.id,
        type: 'set' as const,
        title: s.title,
        releaseDate: s.releaseDate?.toISOString() ?? null,
        channelName: s.channel?.name ?? null,
      })),
      ...stagingSets.map((s) => ({
        id: s.id,
        type: 'staging' as const,
        title: s.title,
        releaseDate: s.releaseDate?.toISOString() ?? null,
        channelName: s.channelName,
      })),
    ]
      .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
      .slice(0, limit)

    return NextResponse.json(results)
  })
}
