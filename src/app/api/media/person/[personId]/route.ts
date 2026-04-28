import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getPersonMediaAcrossSessions } from '@/lib/services/media-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  return withTenantFromHeaders(async () => {
    const { personId } = await params
    const { searchParams } = new URL(request.url)

    const cursor = searchParams.get('cursor') ?? undefined
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '60', 10), 120)
    const search = searchParams.get('search') ?? undefined

    const result = await getPersonMediaAcrossSessions(personId, { cursor, limit, search })

    return NextResponse.json(result)
  })
}
