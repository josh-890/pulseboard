/**
 * POST /api/archive/rematch — start the archive matching pass
 * GET  /api/archive/rematch — how far it has got
 *
 * The pass walks every folder without a confirmed link (~36,000) and takes
 * minutes, so it runs detached and this responds at once. What it must not do is
 * respond at once and then stay silent: the button used to say "Matching pass
 * started…" and nothing after, so a run that did nothing looked exactly like a
 * run that linked hundreds — and like a run that was never started. Progress goes
 * to `Setting` (see archive-rematch-status.ts), which survives the tab that
 * started it.
 *
 * Not the same as the refresh on the staged-sets page: that one matches staged
 * sets against production Sets and never looks at the archive.
 */

import { NextResponse } from 'next/server'
import { withTenantFromHeaders, getCurrentTenantId, runWithTenant } from '@/lib/tenant-context'
import { runMatchingPass } from '@/lib/services/archive-service'
import {
  isRematchRunning,
  readRematchStatus,
  writeRematchStatus,
  type RematchStatus,
} from '@/lib/services/archive-rematch-status'

export async function GET() {
  return withTenantFromHeaders(async () => {
    const status = await readRematchStatus()
    return NextResponse.json({ status, running: isRematchRunning(status) })
  })
}

export async function POST() {
  return withTenantFromHeaders(async () => {
    const tenantId = getCurrentTenantId()

    const existing = await readRematchStatus()
    if (isRematchRunning(existing)) {
      return NextResponse.json(
        { started: false, reason: 'already-running', status: existing },
        { status: 409 },
      )
    }

    const now = new Date().toISOString()
    const status: RematchStatus = {
      startedAt: now,
      progressAt: now,
      finishedAt: null,
      total: 0,
      processed: 0,
      suggested: 0,
      error: null,
    }
    await writeRematchStatus(status)

    // Detached, but inside its own tenant context: the request's AsyncLocalStorage
    // scope ends with the response, and every write in the pass resolves its
    // tenant through that store.
    void runWithTenant(tenantId, async () => {
      let last = { processed: 0, total: 0, suggested: 0 }
      try {
        const result = await runMatchingPass(tenantId, async (p) => {
          last = p
          await writeRematchStatus({
            ...status,
            progressAt: new Date().toISOString(),
            total: p.total,
            processed: p.processed,
            suggested: p.suggested,
          })
        })
        await writeRematchStatus({
          ...status,
          progressAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          total: last.total,
          processed: last.total,
          suggested: result.suggested,
        })
      } catch (err) {
        console.error('[archive/rematch] matching pass failed:', err)
        await writeRematchStatus({
          ...status,
          progressAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        }).catch(() => {})
      }
    })

    return NextResponse.json({ started: true, status })
  })
}
