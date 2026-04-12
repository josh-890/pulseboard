import { NextResponse } from 'next/server'
import { getArchivePaths } from '@/lib/services/archive-service'

function isAuthorized(request: Request): boolean {
  const apiKey = process.env.ARCHIVE_API_KEY
  if (!apiKey) return false
  return request.headers.get('x-archive-key') === apiKey
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const paths = await getArchivePaths()
  return NextResponse.json(paths)
}
