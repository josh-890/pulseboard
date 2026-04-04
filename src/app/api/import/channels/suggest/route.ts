import { NextResponse } from 'next/server'
import { suggestChannels } from '@/lib/services/import/matcher'
import { searchChannelsForResolution } from '@/lib/services/channel-service'
import { withTenantFromHeaders } from '@/lib/tenant-context'

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')
    const q = searchParams.get('q')

    // Fuzzy suggestions by import name (pg_trgm similarity)
    if (name) {
      const suggestions = await suggestChannels(name)
      return NextResponse.json(suggestions)
    }

    // Direct search by query string
    if (q) {
      const channels = await searchChannelsForResolution(q)
      return NextResponse.json(
        channels.map((c) => ({
          id: c.id,
          name: c.name,
          label: c.labelMaps[0]?.label.name ?? null,
        })),
      )
    }

    return NextResponse.json([])
  })
}
