/**
 * POST /api/archive/rematch
 *
 * Triggers a standalone matching pass without a full re-ingest.
 * Useful after skipping a staging set or making other changes that
 * affect which folders get SUGGESTED links.
 */

import { NextResponse } from 'next/server'
import { withTenantFromHeaders } from '@/lib/tenant-context'
import { getCurrentTenantId } from '@/lib/tenant-context'
import { runMatchingPass } from '@/lib/services/archive-service'

export async function POST() {
  return withTenantFromHeaders(async () => {
    const tenantId = getCurrentTenantId()
    // Fire-and-forget — the pass can take a while; respond immediately
    runMatchingPass(tenantId).catch((err) => {
      console.error('[archive/rematch] matching pass failed:', err)
    })
    return NextResponse.json({ started: true })
  })
}
