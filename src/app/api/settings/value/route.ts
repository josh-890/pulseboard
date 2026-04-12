import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getSetting } from '@/lib/services/setting-service'

// Allowlist of keys client components are allowed to read
const READABLE_KEYS = new Set([
  'archive.photosetRoot',
  'archive.videosetRoot',
])

export async function GET(request: Request) {
  return withTenantFromHeaders(async () => {
    const key = new URL(request.url).searchParams.get('key')
    if (!key || !READABLE_KEYS.has(key)) {
      return NextResponse.json({ value: null })
    }
    const value = await getSetting(key)
    return NextResponse.json({ value })
  })
}
