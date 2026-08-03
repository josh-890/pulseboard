/**
 * Attribution suggestions (ADR-0027, plan slice 4).
 *
 * Stores what the catalogue join proposes, and aggregates it into the unit the
 * operator actually decides on: the (channel, alias) group. Nothing here creates
 * a Set, a participant or a Contact — confirmation (slice 5) is the only door
 * into the database, and keeping that boundary sharp is what makes it safe to
 * run the agent repeatedly.
 */
import { prisma } from '@/lib/db'
import type { SuggestionSource, SuggestionTier } from '@/generated/prisma/client'
import { parseFolderParticipantRaw } from '@/lib/services/archive-service'
import { normalizeForSearch } from '@/lib/normalize'

export type IncomingSuggestion = {
  archiveKey: string
  icgId: string
  name: string
  tier: SuggestionTier
  score: number
  /** CROSS_LABEL | AMBIGUOUS | DATE_VARIANT — why this still wants review. */
  demotions: string[]
  evidence?: unknown
}

export type IngestResult = {
  folders: number
  written: number
  unknownFolders: number
}

export const SUGGESTION_SOURCES = ['CATALOGUE', 'REGISTRY', 'FOLDER_ATTRIBUTION'] as const
export const SUGGESTION_TIERS = ['EXACT', 'STRONG', 'WEAK'] as const
/**
 * Why a suggestion still wants a human look. Unknown reasons are dropped, not stored.
 *
 * `UNKNOWN_CHANNEL` is the fail-closed counterpart of `CROSS_LABEL`: the folder's
 * short code resolves to no Channel, so the cross-label check had nothing to
 * compare against and could not fire. Without it an unchecked suggestion is
 * indistinguishable from one that passed the check.
 */
export const SUGGESTION_DEMOTIONS = [
  'CROSS_LABEL',
  'UNKNOWN_CHANNEL',
  'AMBIGUOUS',
  'DATE_VARIANT',
] as const

/**
 * Validate a posted batch whole, before any of it is written.
 *
 * All-or-nothing on purpose: a batch that is written half-way leaves the agent
 * unable to say what landed, and because ingest REPLACES a folder's suggestions,
 * a partially-applied batch is worse than a rejected one.
 */
export function parseSuggestionBatch(
  body: unknown,
): { source: SuggestionSource; suggestions: IncomingSuggestion[] } | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body must be an object' }
  const { source, suggestions } = body as { source?: unknown; suggestions?: unknown }

  if (typeof source !== 'string' || !SUGGESTION_SOURCES.includes(source as SuggestionSource)) {
    return { error: `source must be one of ${SUGGESTION_SOURCES.join(', ')}` }
  }
  if (!Array.isArray(suggestions)) return { error: 'suggestions must be an array' }

  const clean: IncomingSuggestion[] = []
  for (const [i, raw] of suggestions.entries()) {
    if (typeof raw !== 'object' || raw === null) return { error: `suggestion ${i} is not an object` }
    const s = raw as Record<string, unknown>
    if (typeof s.archiveKey !== 'string' || !s.archiveKey) return { error: `suggestion ${i}: archiveKey is required` }
    if (typeof s.icgId !== 'string' || !s.icgId) return { error: `suggestion ${i}: icgId is required` }
    if (typeof s.tier !== 'string' || !SUGGESTION_TIERS.includes(s.tier as SuggestionTier)) {
      return { error: `suggestion ${i}: tier must be one of ${SUGGESTION_TIERS.join(', ')}` }
    }
    clean.push({
      archiveKey: s.archiveKey,
      icgId: s.icgId,
      name: typeof s.name === 'string' && s.name ? s.name : s.icgId,
      tier: s.tier as SuggestionTier,
      score: typeof s.score === 'number' && Number.isFinite(s.score) ? s.score : 0,
      demotions: Array.isArray(s.demotions)
        ? s.demotions.filter(
            (d): d is string =>
              typeof d === 'string' && SUGGESTION_DEMOTIONS.includes(d as (typeof SUGGESTION_DEMOTIONS)[number]),
          )
        : [],
      evidence: s.evidence,
    })
  }
  return { source: source as SuggestionSource, suggestions: clean }
}

/**
 * Replace one source's suggestions for the folders mentioned.
 *
 * Idempotent by design: a folder's rows for THIS source are deleted before the
 * new ones land, so re-running the agent converges instead of accumulating.
 * Other sources are untouched — a hand-written folder attribution must not be
 * erased by a catalogue re-run.
 *
 * Folders not mentioned in the batch keep whatever they have; the agent posts in
 * batches, so absence from one batch means nothing.
 */
export async function ingestSuggestions(
  source: SuggestionSource,
  incoming: IncomingSuggestion[],
): Promise<IngestResult> {
  const byArchiveKey = new Map<string, IncomingSuggestion[]>()
  for (const s of incoming) {
    const bucket = byArchiveKey.get(s.archiveKey)
    if (bucket) bucket.push(s)
    else byArchiveKey.set(s.archiveKey, [s])
  }

  const folders = await prisma.archiveFolder.findMany({
    where: { archiveKey: { in: [...byArchiveKey.keys()] } },
    select: { id: true, archiveKey: true },
  })
  const idByKey = new Map(folders.map((f) => [f.archiveKey, f.id]))

  let written = 0
  let unknownFolders = 0
  for (const [archiveKey, suggestions] of byArchiveKey) {
    const folderId = idByKey.get(archiveKey)
    if (!folderId) {
      unknownFolders++
      continue
    }
    // Per folder, in one transaction: the delete and the insert must not be
    // observable apart, or a concurrent read sees a folder with no suggestions.
    await prisma.$transaction(async (tx) => {
      await tx.archiveFolderSuggestion.deleteMany({ where: { archiveFolderId: folderId, source } })
      if (suggestions.length === 0) return
      await tx.archiveFolderSuggestion.createMany({
        data: suggestions.map((s) => ({
          archiveFolderId: folderId,
          icgId: s.icgId,
          name: s.name,
          source,
          tier: s.tier,
          score: s.score,
          demotions: s.demotions,
          evidence: (s.evidence ?? undefined) as never,
        })),
        skipDuplicates: true,
      })
    })
    written += suggestions.length
  }

  return { folders: byArchiveKey.size, written, unknownFolders }
}

export type SuggestionStats = {
  folders: number
  suggestions: number
  byTier: Record<string, number>
  demoted: number
}

export async function getSuggestionStats(): Promise<SuggestionStats> {
  const [suggestions, tiers, distinctFolders, demoted] = await Promise.all([
    prisma.archiveFolderSuggestion.count(),
    prisma.archiveFolderSuggestion.groupBy({ by: ['tier'], _count: { _all: true } }),
    prisma.archiveFolderSuggestion.findMany({ distinct: ['archiveFolderId'], select: { archiveFolderId: true } }),
    prisma.archiveFolderSuggestion.count({ where: { NOT: { demotions: { isEmpty: true } } } }),
  ])
  return {
    folders: distinctFolders.length,
    suggestions,
    byTier: Object.fromEntries(tiers.map((t) => [t.tier, t._count._all])),
    demoted,
  }
}

export type AttributionGroup = {
  /** `SHORTNAME|alias` — the confirmation unit. */
  key: string
  channelShortName: string | null
  aliasToken: string | null
  folders: number
  /** Votes for who the ALIAS is, highest first. */
  votes: { icgId: string; name: string; folders: number }[]
  /** Folders in the group carrying at least one demoted suggestion. */
  demotedFolders: number
}

export type GroupableFolder = {
  folderName: string
  parsedShortName: string | null
  suggestions: { icgId: string; name: string; demotions: string[] }[]
}

/**
 * Fold folders into the unit an operator decides on: the (channel, alias) group.
 *
 * Pure, so the folding rules — one vote per folder per person, demotion carried
 * up to the group — can be tested without a database. Grouping is what makes the
 * work finite: 8,904 groups against 29,322 folders, with the top 1,000 groups
 * covering 48 % of them. A group where every folder agrees is one decision;
 * disagreement inside a group is a signal, not noise, because it marks aliases
 * that were reused or sets with more than one participant.
 */
export function aggregateAttributionGroups(
  rows: GroupableFolder[],
  opts: { limit?: number; minFolders?: number } = {},
): AttributionGroup[] {
  const groups = new Map<
    string,
    Omit<AttributionGroup, 'votes'> & { voteMap: Map<string, { name: string; n: number }> }
  >()

  for (const r of rows) {
    const aliasToken = parseFolderParticipantRaw(r.folderName)
    const key = `${(r.parsedShortName ?? '?').toUpperCase()}|${normalizeForSearch(aliasToken ?? '')}`
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        channelShortName: r.parsedShortName,
        aliasToken,
        folders: 0,
        demotedFolders: 0,
        voteMap: new Map(),
      }
      groups.set(key, g)
    }
    g.folders++
    if (r.suggestions.some((s) => s.demotions.length > 0)) g.demotedFolders++
    // One vote per folder per person: a folder carrying the same person from two
    // sources is one folder agreeing, not two.
    const seen = new Set<string>()
    for (const s of r.suggestions) {
      if (seen.has(s.icgId)) continue
      seen.add(s.icgId)
      const v = g.voteMap.get(s.icgId)
      if (v) v.n++
      else g.voteMap.set(s.icgId, { name: s.name, n: 1 })
    }
  }

  const out = [...groups.values()]
    .filter((g) => g.folders >= (opts.minFolders ?? 1))
    .map(({ voteMap, ...g }) => ({
      ...g,
      votes: [...voteMap.entries()]
        .map(([icgId, v]) => ({ icgId, name: v.name, folders: v.n }))
        .sort((a, b) => b.folders - a.folders || a.icgId.localeCompare(b.icgId)),
    }))
    .sort((a, b) => b.folders - a.folders || a.key.localeCompare(b.key))

  return opts.limit ? out.slice(0, opts.limit) : out
}

/** The confirmation queue: unlinked archive folders folded into (channel, alias) groups. */
export async function getAttributionGroups(
  opts: { limit?: number; minFolders?: number } = {},
): Promise<AttributionGroup[]> {
  const rows = await prisma.archiveFolder.findMany({
    where: { missingOnDisk: false, archiveLink: null },
    select: {
      folderName: true,
      parsedShortName: true,
      suggestions: { select: { icgId: true, name: true, demotions: true } },
    },
  })
  return aggregateAttributionGroups(rows, opts)
}
