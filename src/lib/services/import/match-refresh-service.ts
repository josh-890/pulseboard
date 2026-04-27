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
    Array<{ id: string; title: string; externalId: string | null; channelName: string; releaseDate: Date | null }>
  >`
    SELECT id, title, "externalId", "channelName", "releaseDate"
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

// ─── Internal ─────────────────────────────────────────────────────────────

async function recomputeMatchesForSets(
  sets: Array<{
    id: string
    title: string
    externalId: string | null
    channelName: string
    releaseDate: Date | null
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

    // Only update if match state changed
    const newMatchId = result.matchedEntityId ?? null
    const newConfidence = result.matchConfidence ?? null
    const newDetails = result.matchDetails ?? null

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
