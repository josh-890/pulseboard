import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { ingestScanResults } from '@/lib/services/archive-service'
import type { ScanResult } from '@/lib/services/archive-service'

function isAuthorized(request: Request): boolean {
  const apiKey = process.env.ARCHIVE_API_KEY
  if (!apiKey) return false
  return request.headers.get('x-archive-key') === apiKey
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return withTenantFromHeaders(async () => {
    let results: ScanResult[]
    try {
      results = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (!Array.isArray(results)) {
      return NextResponse.json({ error: 'Expected array of scan results' }, { status: 400 })
    }

    await ingestScanResults(results)
    return NextResponse.json({ ok: true, count: results.length })
  })
}
