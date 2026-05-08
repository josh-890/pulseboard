import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getBasketWithItems, getOrCreateBasket } from '@/lib/services/import/cover-basket-service'

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = new URL(request.url)
    const personId = searchParams.get('personId')
    const isVideoParam = searchParams.get('isVideo')

    if (!personId || isVideoParam === null) {
      return NextResponse.json({ error: 'personId and isVideo are required' }, { status: 400 })
    }

    const isVideo = isVideoParam === 'true'
    const basket = await getBasketWithItems(personId, isVideo)
    return NextResponse.json(basket ?? null)
  })
}

export async function POST(request: Request) {
  return withTenantFromHeaders(async () => {
    const body = await request.json() as { personId?: string; isVideo?: boolean }
    if (!body.personId || body.isVideo === undefined) {
      return NextResponse.json({ error: 'personId and isVideo are required' }, { status: 400 })
    }

    const basket = await getOrCreateBasket(body.personId, body.isVideo)
    return NextResponse.json(basket)
  })
}
