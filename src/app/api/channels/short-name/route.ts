import { NextResponse } from 'next/server'
import { suggestUniqueShortName, isShortNameAvailable } from '@/lib/services/channel-service'

/**
 * GET /api/channels/short-name?name=FemJoy&excludeId=xxx  → { suggestion: "FJ" }
 * GET /api/channels/short-name?check=FJ&excludeId=xxx     → { available: true }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  const check = searchParams.get('check')
  const excludeId = searchParams.get('excludeId') ?? undefined

  if (check) {
    const available = await isShortNameAvailable(check, excludeId)
    return NextResponse.json({ available })
  }

  if (name) {
    const suggestion = await suggestUniqueShortName(name, excludeId)
    return NextResponse.json({ suggestion })
  }

  return NextResponse.json({ error: 'Provide ?name= or ?check=' }, { status: 400 })
}
