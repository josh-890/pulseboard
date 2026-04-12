import { NextRequest, NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { setSetting } from '@/lib/services/setting-service'
import { ARCHIVE_PHOTOSET_ROOT_KEY, ARCHIVE_VIDEOSET_ROOT_KEY } from '@/lib/services/archive-service'

export async function POST(req: NextRequest) {
  return withTenantFromHeaders(async () => {
    const body = await req.json() as { photosetRoot?: string; videosetRoot?: string }

    if (body.photosetRoot !== undefined) {
      await setSetting(ARCHIVE_PHOTOSET_ROOT_KEY, body.photosetRoot)
    }
    if (body.videosetRoot !== undefined) {
      await setSetting(ARCHIVE_VIDEOSET_ROOT_KEY, body.videosetRoot)
    }

    return NextResponse.json({ success: true })
  })
}
