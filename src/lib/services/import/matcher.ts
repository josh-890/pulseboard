/**
 * DB matching service for import pipeline.
 *
 * Re-runs on every batch load to provide dynamic sync.
 * Uses tiered matching: exact ID match → fuzzy name (trigram).
 */

import { prisma } from '@/lib/db'
import type {
  ParsedImportData,
  ParsedCoModel,
  ParsedSet,
} from './parser'

// ─── Types ──────────────────────────────────────────────────────────────────

export type MatchResult = {
  matchedEntityId: string | null
  matchConfidence: number | null // 0.0–1.0
  matchDetails: string | null
}

export type PersonMatchResult = MatchResult & {
  existingName?: string
}

export type ChannelMatchResult = MatchResult & {
  existingName?: string
}

export type SetMatchResult = MatchResult & {
  existingTitle?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// ─── Person Matching ────────────────────────────────────────────────────────

export async function matchPerson(icgId: string, name: string): Promise<PersonMatchResult> {
  // Tier 1: Exact icgId match
  const exactMatch = await prisma.person.findUnique({
    where: { icgId },
    select: {
      id: true,
      aliases: {
        where: { isCommon: true },
        select: { name: true },
        take: 1,
      },
    },
  })

  if (exactMatch) {
    return {
      matchedEntityId: exactMatch.id,
      matchConfidence: 1.0,
      matchDetails: `Exact ICG-ID match: ${icgId}`,
      existingName: exactMatch.aliases[0]?.name,
    }
  }

  // Tier 2: Fuzzy name match via pg_trgm
  const nameNorm = normalizeForMatch(name)
  if (!nameNorm) return { matchedEntityId: null, matchConfidence: null, matchDetails: null }

  const fuzzyResults = await prisma.$queryRaw<
    Array<{ person_id: string; alias_name: string; sim: number }>
  >`
    SELECT pa."personId" AS person_id, pa.name AS alias_name,
           similarity(pa."nameNorm", ${nameNorm}) AS sim
    FROM "PersonAlias" pa
    WHERE similarity(pa."nameNorm", ${nameNorm}) > 0.6
    ORDER BY sim DESC
    LIMIT 1
  `

  if (fuzzyResults.length > 0) {
    const r = fuzzyResults[0]
    return {
      matchedEntityId: r.person_id,
      matchConfidence: Number(r.sim),
      matchDetails: `Fuzzy name match: "${r.alias_name}" (similarity: ${Number(r.sim).toFixed(2)})`,
      existingName: r.alias_name,
    }
  }

  return { matchedEntityId: null, matchConfidence: null, matchDetails: null }
}

// ─── Channel Matching ───────────────────────────────────────────────────────

export async function matchChannel(channelName: string): Promise<ChannelMatchResult> {
  const nameNorm = normalizeForMatch(channelName)

  // Tier 0: Exact match on importAliases
  const aliasMatch = await prisma.channel.findFirst({
    where: { importAliases: { has: channelName } },
    select: { id: true, name: true },
  })

  if (aliasMatch) {
    return {
      matchedEntityId: aliasMatch.id,
      matchConfidence: 1.0,
      matchDetails: `Import alias match: "${aliasMatch.name}"`,
      existingName: aliasMatch.name,
    }
  }

  // Tier 1: Exact nameNorm match
  const exactMatch = await prisma.channel.findFirst({
    where: { nameNorm },
    select: { id: true, name: true },
  })

  if (exactMatch) {
    return {
      matchedEntityId: exactMatch.id,
      matchConfidence: 1.0,
      matchDetails: `Exact name match: "${exactMatch.name}"`,
      existingName: exactMatch.name,
    }
  }

  // Tier 2: Fuzzy match via pg_trgm (return best match)
  const fuzzyResults = await prisma.$queryRaw<
    Array<{ id: string; name: string; sim: number }>
  >`
    SELECT id, name, similarity("nameNorm", ${nameNorm}) AS sim
    FROM "Channel"
    WHERE similarity("nameNorm", ${nameNorm}) > 0.5
    ORDER BY sim DESC
    LIMIT 1
  `

  if (fuzzyResults.length > 0) {
    const r = fuzzyResults[0]
    return {
      matchedEntityId: r.id,
      matchConfidence: Number(r.sim),
      matchDetails: `Fuzzy name match: "${r.name}" (similarity: ${Number(r.sim).toFixed(2)})`,
      existingName: r.name,
    }
  }

  return { matchedEntityId: null, matchConfidence: null, matchDetails: null }
}

/** Return multiple fuzzy channel suggestions for the resolution UI */
export async function suggestChannels(
  channelName: string,
): Promise<Array<{ id: string; name: string; similarity: number }>> {
  const nameNorm = normalizeForMatch(channelName)
  if (!nameNorm) return []

  const results = await prisma.$queryRaw<
    Array<{ id: string; name: string; sim: number }>
  >`
    SELECT id, name, similarity("nameNorm", ${nameNorm}) AS sim
    FROM "Channel"
    WHERE similarity("nameNorm", ${nameNorm}) > 0.3
    ORDER BY sim DESC
    LIMIT 10
  `

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    similarity: Number(r.sim),
  }))
}

// ─── Label Matching ─────────────────────────────────────────────────────────

export async function matchLabel(labelName: string): Promise<MatchResult> {
  const nameNorm = normalizeForMatch(labelName)

  const exactMatch = await prisma.label.findFirst({
    where: { nameNorm },
    select: { id: true, name: true },
  })

  if (exactMatch) {
    return {
      matchedEntityId: exactMatch.id,
      matchConfidence: 1.0,
      matchDetails: `Exact name match: "${exactMatch.name}"`,
    }
  }

  return { matchedEntityId: null, matchConfidence: null, matchDetails: null }
}

// ─── Set Matching ───────────────────────────────────────────────────────────

export async function matchSet(set: ParsedSet): Promise<SetMatchResult> {
  // Tier 1: Exact externalId match
  if (set.externalId) {
    const exactMatch = await prisma.set.findFirst({
      where: {
        externalId: set.externalId,
        archiveLinks: { none: { status: 'CONFIRMED' } },
      },
      select: { id: true, title: true },
    })

    if (exactMatch) {
      return {
        matchedEntityId: exactMatch.id,
        matchConfidence: 1.0,
        matchDetails: `Exact external ID match: ${set.externalId}`,
        existingTitle: exactMatch.title,
      }
    }
  }

  // Tier 2: Title + Channel + Date within ±30 days
  const titleNorm = normalizeForMatch(set.title)
  if (set.date && set.channelName) {
    const setDate = new Date(set.date)
    if (!isNaN(setDate.getTime())) {
      const dateFrom = new Date(setDate.getTime() - 30 * 24 * 60 * 60 * 1000)
      const dateTo = new Date(setDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      const channelNorm = normalizeForMatch(set.channelName)

      const multiSignal = await prisma.$queryRaw<
        Array<{ id: string; title: string; sim: number }>
      >`
        SELECT s.id, s.title, similarity(s."titleNorm", ${titleNorm}) AS sim
        FROM "Set" s
        JOIN "Channel" c ON c.id = s."channelId"
        WHERE similarity(s."titleNorm", ${titleNorm}) > 0.6
          AND c."nameNorm" = ${channelNorm}
          AND s."releaseDate" BETWEEN ${dateFrom} AND ${dateTo}
          AND NOT EXISTS (SELECT 1 FROM "ArchiveLink" al WHERE al."setId" = s.id AND al.status = 'CONFIRMED')
        ORDER BY sim DESC
        LIMIT 1
      `

      if (multiSignal.length > 0) {
        const r = multiSignal[0]
        return {
          matchedEntityId: r.id,
          matchConfidence: Math.min(0.95, Number(r.sim)),
          matchDetails: `Title+Channel+Date match: "${r.title}" (similarity: ${Number(r.sim).toFixed(2)})`,
          existingTitle: r.title,
        }
      }
    }
  }

  // Tier 3: Title similarity only (lowest confidence)
  if (titleNorm) {
    const titleOnly = await prisma.$queryRaw<
      Array<{ id: string; title: string; sim: number }>
    >`
      SELECT s.id, s.title, similarity(s."titleNorm", ${titleNorm}) AS sim
      FROM "Set" s
      WHERE similarity(s."titleNorm", ${titleNorm}) > 0.8
        AND NOT EXISTS (SELECT 1 FROM "ArchiveLink" al WHERE al."setId" = s.id AND al.status = 'CONFIRMED')
      ORDER BY sim DESC
      LIMIT 1
    `

    if (titleOnly.length > 0) {
      const r = titleOnly[0]
      return {
        matchedEntityId: r.id,
        matchConfidence: Math.min(0.7, Number(r.sim) * 0.7),
        matchDetails: `Title-only match: "${r.title}" (similarity: ${Number(r.sim).toFixed(2)})`,
        existingTitle: r.title,
      }
    }
  }

  return { matchedEntityId: null, matchConfidence: null, matchDetails: null }
}

// ─── Digital Identity Matching ──────────────────────────────────────────────

export type IdentityMatchResult = MatchResult & {
  comparisonStatus: 'identical' | 'new'
}

/**
 * Compare an import identity against a person's existing digital identities.
 * Matches by URL (primary) or platform+handle combo (fallback).
 */
export async function matchDigitalIdentity(
  personId: string,
  platform: string,
  url: string | null,
  handle: string | null,
): Promise<IdentityMatchResult> {
  // Try URL match first (most reliable)
  if (url) {
    const urlMatch = await prisma.personDigitalIdentity.findFirst({
      where: { personId, url },
      select: { id: true, platform: true },
    })
    if (urlMatch) {
      return {
        matchedEntityId: urlMatch.id,
        matchConfidence: 1.0,
        matchDetails: `Identical: ${urlMatch.platform} URL already exists`,
        comparisonStatus: 'identical',
      }
    }
  }

  // Fallback: platform + handle match
  if (handle) {
    const handleMatch = await prisma.personDigitalIdentity.findFirst({
      where: {
        personId,
        platform: { equals: platform, mode: 'insensitive' },
        handle: { equals: handle, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (handleMatch) {
      return {
        matchedEntityId: handleMatch.id,
        matchConfidence: 1.0,
        matchDetails: `Identical: ${platform} handle already exists`,
        comparisonStatus: 'identical',
      }
    }
  }

  return {
    matchedEntityId: null,
    matchConfidence: null,
    matchDetails: null,
    comparisonStatus: 'new',
  }
}

// ─── Batch Matching ─────────────────────────────────────────────────────────

export type BatchMatchResults = {
  person: PersonMatchResult
  channels: Map<string, ChannelMatchResult>  // keyed by uppercase channel name
  labels: Map<string, MatchResult>           // keyed by uppercase label name (= channel name)
  sets: Map<string, SetMatchResult>          // keyed by externalId
  coModels: Map<string, PersonMatchResult>   // keyed by icgId
  identities: Map<string, IdentityMatchResult>  // keyed by item data key (platform:url or platform:handle)
}

export async function matchAllEntities(data: ParsedImportData): Promise<BatchMatchResults> {
  // Match person (subject)
  const person = await matchPerson(data.person.icgId, data.person.name)

  // Match channels (deduplicated)
  const channelNames = new Set<string>()
  for (const ca of data.channelAppearances) channelNames.add(ca.channelName.toUpperCase())
  for (const s of data.sets) channelNames.add(s.channelName.toUpperCase())

  const channels = new Map<string, ChannelMatchResult>()
  for (const name of channelNames) {
    channels.set(name, await matchChannel(name))
  }

  // Match labels (auto-derived from channel names)
  const labels = new Map<string, MatchResult>()
  for (const name of channelNames) {
    labels.set(name, await matchLabel(name))
  }

  // Match sets by externalId
  const sets = new Map<string, SetMatchResult>()
  for (const s of data.sets) {
    if (s.externalId) {
      sets.set(s.externalId, await matchSet(s))
    }
  }

  // Match co-models by icgId
  const coModels = new Map<string, PersonMatchResult>()
  const uniqueCoModels = new Map<string, ParsedCoModel>()
  for (const cm of data.coModels) uniqueCoModels.set(cm.icgId, cm)
  for (const s of data.sets) {
    for (const m of s.modelsList) {
      if (m.icgId !== data.person.icgId && !uniqueCoModels.has(m.icgId)) {
        uniqueCoModels.set(m.icgId, { name: m.name, icgId: m.icgId, url: m.url, thumbUrl: null })
      }
    }
  }
  for (const [icgId, cm] of uniqueCoModels) {
    coModels.set(icgId, await matchPerson(icgId, cm.name))
  }

  // Match digital identities (only if person is already in DB)
  const identities = new Map<string, IdentityMatchResult>()
  const personId = person.matchedEntityId
  if (personId && data.digitalIdentities) {
    for (const di of data.digitalIdentities) {
      const key = `${di.platform}:${di.url || ''}`
      identities.set(key, await matchDigitalIdentity(
        personId,
        di.platform,
        di.url || null,
        null,
      ))
    }
  }

  return { person, channels, labels, sets, coModels, identities }
}
