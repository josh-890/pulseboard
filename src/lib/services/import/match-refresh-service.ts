/**
 * Match refresh service for staging sets.
 *
 * Maintains the pre-computed match fields (matchedSetId, matchConfidence,
 * matchDetails) on StagingSet rows by re-running the matcher against
 * current production Sets.
 *
 * Three refresh strategies:
 *  - Targeted by title+channel (after Set creation)
 *  - Full refresh (manual, all non-terminal rows)
 *  - Auto-refresh (24hr throttle via Setting table)
 */

import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import { matchSet } from './matcher'
import type { ParsedSet } from './parser'

const REFRESH_SETTING_KEY = 'matches.lastRefresh'

/**
 * Whether a recompute should overwrite the cached match fields.
 *
 * True only when the matched TARGET changed (including null↔id). When the target
 * is unchanged we leave matchConfidence/matchDetails alone — this preserves a
 * user-confirmed match (recorded as matchConfidence=1.0 in the staging panel)
 * that an unconditional rewrite would otherwise reset to the fuzzy score,
 * blocking promotion. See the call site for the full rationale.
 */
export function matchTargetChanged(
  cachedMatchId: string | null,
  newMatchId: string | null,
): boolean {
  return cachedMatchId !== newMatchId
}

// ─── Targeted Refresh ─────────────────────────────────────────────────────

/**
 * After a new Set is created, find staging sets that might match it
 * and re-run the matcher on them. Returns updated count.
 */
export async function refreshMatchesForTitle(
  title: string,
  channelId: string,
): Promise<number> {
  const titleNorm = normalizeForSearch(title)

  // Find the channel's nameNorm and any import aliases for broader matching
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { nameNorm: true, name: true },
  })
  if (!channel) return 0

  // Find staging sets in same channel (by resolved channelId or by channel name)
  // that aren't already terminal
  const candidates = await prisma.$queryRaw<
    Array<{ id: string; title: string; externalId: string | null; channelName: string; releaseDate: Date | null; matchedSetId: string | null; rejectedMatchSetIds: string[] }>
  >`
    SELECT id, title, "externalId", "channelName", "releaseDate", "matchedSetId", "rejectedMatchSetIds"
    FROM "StagingSet"
    WHERE status NOT IN ('PROMOTED', 'SKIPPED')
      AND (
        "channelId" = ${channelId}
        OR lower("channelName") = ${channel.nameNorm}
      )
      AND (
        similarity("titleNorm", ${titleNorm}) > 0.5
        OR "titleNorm" = ${titleNorm}
      )
  `

  if (candidates.length === 0) return 0
  return recomputeMatchesForSets(candidates)
}

// ─── Full Refresh ─────────────────────────────────────────────────────────

/**
 * Re-run matcher on ALL non-terminal staging sets.
 * Updates match fields and records refresh timestamp.
 */
export async function refreshAllMatches(): Promise<number> {
  const BATCH_SIZE = 200
  let updated = 0
  let skip = 0

  while (true) {
    const batch = await prisma.stagingSet.findMany({
      where: { status: { notIn: ['PROMOTED', 'SKIPPED'] } },
      select: {
        id: true,
        title: true,
        externalId: true,
        channelName: true,
        releaseDate: true,
        matchedSetId: true,
        rejectedMatchSetIds: true,
      },
      orderBy: { id: 'asc' },
      skip,
      take: BATCH_SIZE,
    })

    if (batch.length === 0) break
    updated += await recomputeMatchesForSets(batch)
    skip += BATCH_SIZE
  }

  // Record timestamp
  await prisma.setting.upsert({
    where: { key: REFRESH_SETTING_KEY },
    update: { value: new Date().toISOString() },
    create: { key: REFRESH_SETTING_KEY, value: new Date().toISOString() },
  })

  return updated
}

// ─── Auto-Refresh (24hr Throttle) ─────────────────────────────────────────

/**
 * Refresh all matches if more than 24 hours since last full refresh.
 * Returns updated count, or 0 if no refresh was needed.
 */
export async function refreshMatchesIfStale(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: REFRESH_SETTING_KEY },
  })

  if (setting) {
    const lastRefresh = new Date(setting.value)
    const hoursSince = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60)
    if (hoursSince < 24) return 0
  }

  return refreshAllMatches()
}

// ─── Single-Set Refresh ───────────────────────────────────────────────────

/**
 * Re-run the matcher against ONE staging set and write the result.
 * Called from the promote API route to eliminate the 24h staleness window
 * — the cached matchedSetId on the staging row is recomputed against
 * current Set table state before the promote dispatch reads it.
 *
 * No-ops silently if the staging set doesn't exist or is in a terminal
 * state (PROMOTED / SKIPPED) — terminal rows shouldn't have their cached
 * match overwritten.
 */
export async function recomputeMatchForStagingSet(id: string): Promise<void> {
  const ss = await prisma.stagingSet.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      title: true,
      externalId: true,
      channelName: true,
      releaseDate: true,
      matchedSetId: true,
      rejectedMatchSetIds: true,
    },
  })
  if (!ss) return
  if (ss.status === 'PROMOTED' || ss.status === 'SKIPPED') return
  await recomputeMatchesForSets([
    {
      id: ss.id,
      title: ss.title,
      externalId: ss.externalId,
      channelName: ss.channelName,
      releaseDate: ss.releaseDate,
      matchedSetId: ss.matchedSetId,
      rejectedMatchSetIds: ss.rejectedMatchSetIds,
    },
  ])
}

// ─── Internal ─────────────────────────────────────────────────────────────

async function recomputeMatchesForSets(
  sets: Array<{
    id: string
    title: string
    externalId: string | null
    channelName: string
    releaseDate: Date | null
    /** Currently cached match target — used to decide whether to overwrite. */
    matchedSetId: string | null
    /** Set ids the user explicitly rejected ("Wrong Match") — never re-cache these. */
    rejectedMatchSetIds?: string[]
  }>,
): Promise<number> {
  let updated = 0

  for (const ss of sets) {
    // Build a ParsedSet-like object for the matcher
    const parsed: ParsedSet = {
      longTitle: ss.title,
      title: ss.title,
      externalId: ss.externalId ?? '',
      titleUrl: '',
      channelName: ss.channelName,
      artist: null,
      coverImageUrl: null,
      coverImageAlt: null,
      date: ss.releaseDate?.toISOString().split('T')[0] ?? null,
      description: null,
      suggestedDate: null,
      imageCount: null,
      isVideo: false,
      modelsCount: 0,
      modelsList: [],
    }

    const result = await matchSet(parsed)

    let newMatchId = result.matchedEntityId ?? null
    let newConfidence = result.matchConfidence ?? null
    let newDetails = result.matchDetails ?? null

    // Honor a user's persistent "Wrong Match": never re-cache a rejected target
    // (otherwise a fuzzy series match — "Part 2" → "Part 1" — keeps reappearing).
    if (newMatchId && (ss.rejectedMatchSetIds ?? []).includes(newMatchId)) {
      newMatchId = null
      newConfidence = null
      newDetails = null
    }

    // Only overwrite when the matched TARGET changes. This honors the original
    // intent ("only update if match state changed") and, crucially, preserves a
    // user-confirmed match: the staging panel records confirmation by bumping
    // matchConfidence to 1.0, and the promote route recomputes before the merge
    // guard reads it. An unconditional rewrite reset that confirmed 1.0 back to
    // the fuzzy score, making confirmed fuzzy merges impossible to promote
    // ("Refusing to merge … confidence is 0.95"). Skipping the rewrite for an
    // unchanged target is safe: guards 1 & 2 in validateCachedMatchForPromote
    // still catch a deleted target / externalId drift before enriching. When the
    // target genuinely changes (stale cache — the "Grecian Sirens" case) we
    // still rewrite, so that protection is intact.
    if (!matchTargetChanged(ss.matchedSetId, newMatchId)) continue

    await prisma.stagingSet.update({
      where: { id: ss.id },
      data: {
        matchedSetId: newMatchId,
        matchConfidence: newConfidence,
        matchDetails: newDetails,
      },
    })
    updated++
  }

  return updated
}
