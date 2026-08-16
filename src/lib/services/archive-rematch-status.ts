/**
 * What the archive matching pass is doing, so the button can say something true.
 *
 * The pass walks ~36,000 folders and takes minutes — too long for one request, so
 * it runs detached and the route answers immediately. That left the UI saying
 * "Matching pass started…" and never anything else: when a run produced nothing,
 * did nothing, or was never started at all, the screen looked identical. A test
 * against a fresh import was read as "the matcher is broken" on that evidence
 * alone, when in fact the operator had pressed the *other* refresh button — the
 * one on the staged-sets page, which matches staged sets to production Sets and
 * never touches the archive.
 *
 * Progress lives in `Setting` rather than in memory because the answer has to
 * survive the page (a run outlives the tab that started it) and a container
 * restart (after which no run is in flight, whatever the last record says).
 */
import { prisma } from '@/lib/db'

export const REMATCH_STATUS_KEY = 'archive.rematch.status'

export type RematchStatus = {
  startedAt: string
  /** Heartbeat: last time the pass wrote progress. */
  progressAt: string
  finishedAt: string | null
  total: number
  processed: number
  suggested: number
  error: string | null
}

/**
 * A run whose heartbeat has gone quiet for this long is not coming back — the
 * process died or the container was rebuilt. Without this, one crashed run would
 * block the button for ever.
 */
export const STALE_AFTER_MS = 5 * 60_000

/** Pure so the staleness rule can be tested without a database. */
export function isRematchRunning(status: RematchStatus | null, now: number = Date.now()): boolean {
  if (!status || status.finishedAt || status.error) return false
  const beat = Date.parse(status.progressAt)
  if (Number.isNaN(beat)) return false
  return now - beat < STALE_AFTER_MS
}

/** True when the record describes a run that stopped without saying so. */
export function isRematchStalled(status: RematchStatus | null, now: number = Date.now()): boolean {
  if (!status || status.finishedAt || status.error) return false
  const beat = Date.parse(status.progressAt)
  if (Number.isNaN(beat)) return true
  return now - beat >= STALE_AFTER_MS
}

export async function readRematchStatus(): Promise<RematchStatus | null> {
  const row = await prisma.setting.findUnique({ where: { key: REMATCH_STATUS_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as RematchStatus
  } catch {
    return null
  }
}

export async function writeRematchStatus(status: RematchStatus): Promise<void> {
  const value = JSON.stringify(status)
  await prisma.setting.upsert({
    where: { key: REMATCH_STATUS_KEY },
    update: { value },
    create: { key: REMATCH_STATUS_KEY, value },
  })
}
