import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { prisma } from '@/lib/db'
import { getPersonMediaAcrossSessions, getPersonSessionsWithMedia } from '@/lib/services/media-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { personId } = await params
    const { searchParams } = new URL(request.url)

    // ?sessions=1 → return session list with counts
    if (searchParams.get('sessions') === '1') {
      const sessions = await getPersonSessionsWithMedia(personId)
      return NextResponse.json(sessions)
    }

    const cursor = searchParams.get('cursor') ?? undefined
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '60', 10), 500)
    const search = searchParams.get('search') ?? undefined
    const sessionId = searchParams.get('sessionId') ?? undefined
    const categoryId = searchParams.get('categoryId') ?? undefined

    const result = await getPersonMediaAcrossSessions(personId, { cursor, limit, search, sessionId })

    if (!categoryId) {
      return NextResponse.json(result)
    }

    // Fetch which items are already linked to this category for this person
    const links = await prisma.personMediaLink.findMany({
      where: { personId, usage: 'DETAIL', categoryId },
      select: { mediaItemId: true },
    })
    const linkedIds = new Set(links.map((l) => l.mediaItemId))

    const itemsWithLinked = result.items.map((item) => ({
      ...item,
      isLinked: linkedIds.has(item.id),
    }))

    return NextResponse.json({ items: itemsWithLinked, nextCursor: result.nextCursor })
  })
}
