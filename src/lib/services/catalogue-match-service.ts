/**
 * Archive ↔ catalogue matching in the app (ADR-0038 S5, replaces the
 * catalogue-join agent).
 *
 * An archive folder is named `YYYY-MM-DD-SHORT Alias - Title`. Against the
 * catalogue set table (one row per CoverId, union cast) every set on the
 * folder's date is a candidate — on its own date or any other date a file gave
 * it (a match through one of those carries DATE_VARIANT). Each candidate is
 * weighed on three signals, and the evidence ladder decides how strong it is:
 *
 *   channel  the set's catalogue channel is linked by import alias to the
 *            channel whose Shortname starts the folder name (an unlinked name
 *            gives no channel evidence — ADR-0038, channels)
 *   alias    the folder's name part is a known name of someone in the cast: her
 *            catalogue alias on that channel, her catalogue name, AKA, or an
 *            alias of the Person
 *   title    similarity of the folder's title to the set's (catalogue-join's
 *            Sørensen–Dice over bigrams)
 *
 *   EXACT    channel + alias (titles may differ), or channel + exact title
 *   STRONG   two of: channel · alias · title ≥ .75
 *   WEAK     alias, or title ≥ .50, or channel alone when it is the only set
 *            on that channel that day
 *
 * The strongest candidates win; winners with different casts are reported as
 * AMBIGUOUS (unless the folder names several people, or its alias names one of
 * them), never guessed. The demotions say why a suggestion still wants a look:
 * CROSS_LABEL (the two channels belong to different labels), UNKNOWN_CHANNEL
 * (either side does not resolve to a channel), AMBIGUOUS, DATE_VARIANT.
 *
 * It writes only CATALOGUE suggestions, replacing each matched folder's own.
 * Decisions live elsewhere (attributions, group decisions, per-folder dismissals)
 * and are never touched, so a decided folder is never reopened; settled folders
 * (a confirmed link) are not matched at all.
 */
import { prisma } from '@/lib/db'
import { runWithTenant } from '@/lib/tenant-context'
import { UNSETTLED_FOLDER } from '@/lib/services/archive-unsettled'
import { parseFolderParticipantRaw } from '@/lib/services/archive-service'
import { getSetting, setSetting } from '@/lib/services/setting-service'
import { aliasTokenLooksMulti, normalizeTitle, titleSimilarity } from '@/lib/services/catalogue-join'
import type { Prisma, SuggestionTier } from '@/generated/prisma/client'

export type CatalogueMatchScope =
  | { kind: 'all' }
  /** Folders a scan found from this moment on */
  | { kind: 'discoveredSince'; since: Date }
  | { kind: 'folders'; ids: string[] }

export type CatalogueMatchResult = {
  at: string
  scope: CatalogueMatchScope['kind']
  folders: number
  /** Folders with at least one suggestion now */
  matched: number
  /** Matched folders per tier */
  byTier: Record<SuggestionTier, number>
  /** Matched folders carrying a demotion */
  demoted: number
  suggestions: number
  durationMs: number
}

export const MATCH_SETTING = 'catalogue.match.last'
const DATES_PER_CHUNK = 400

// ── The evidence ladder (pure) ───────────────────────────────────────────────

export type Signals = {
  channel: boolean
  alias: boolean
  title: number
  /** The only candidate that day whose channel agrees */
  onlyOnChannel: boolean
}

export type Tier = 'EXACT' | 'STRONG' | 'WEAK'

export function evidenceTier(s: Signals): Tier | null {
  if (s.channel && (s.alias || s.title >= 0.999)) return 'EXACT'
  if (Number(s.channel) + Number(s.alias) + Number(s.title >= 0.75) >= 2) return 'STRONG'
  if (s.alias || s.title >= 0.5 || (s.channel && s.onlyOnChannel)) return 'WEAK'
  return null
}

const TIER_RANK: Record<Tier, number> = { EXACT: 3, STRONG: 2, WEAK: 1 }

/**
 * Within a tier, more evidence ranks higher: channel and alias count one each, a
 * title its similarity — but only from .50 on, the threshold where it counts as
 * evidence at all. Otherwise "channel alone" would quietly beat "exact title
 * alone" on the same day, where the two are a tie to show, not to decide.
 */
export function evidenceScore(s: Signals): number {
  return Number(s.channel) + Number(s.alias) + (s.title >= 0.5 ? s.title : 0)
}

export type Candidate = {
  coverId: string
  /** The date it matched on */
  date: string
  viaAltDate: boolean
  channelName: string
  title: string
  cast: string[]
}

type ChannelRef = { id: string; labelId: string | null }
export type ChannelMaps = { byAlias: Map<string, ChannelRef>; byShort: Map<string, ChannelRef> }

/**
 * Every known name of a person, keyed so that a folder's alias token finds it by
 * equality: a name contributes each of its leading word runs ("Luba D" is found
 * by "luba" and "luba d"). `channel` scopes a catalogue alias to its channel
 * (upper-cased name); null means any channel.
 */
export type NameIndex = Map<string, { icgId: string; channel: string | null }[]>

export function addName(index: NameIndex, name: string, icgId: string, channel: string | null) {
  const words = normalizeTitle(name).split(' ').filter(Boolean)
  for (let k = 1; k <= words.length; k++) {
    const key = words.slice(0, k).join(' ')
    const bucket = index.get(key)
    const entry = { icgId, channel }
    if (!bucket) index.set(key, [entry])
    else if (!bucket.some((e) => e.icgId === icgId && e.channel === channel)) bucket.push(entry)
  }
}

/** The folder's name part as one or several tokens ("Michelle & Rebecca") */
export function aliasTokens(aliasToken: string | null): string[] {
  if (!aliasToken) return []
  return aliasToken
    .split(/\s(?:&|and|\+)\s|,/i)
    .map((t) => normalizeTitle(t))
    .filter(Boolean)
}

/** Cast members of the candidate a token names */
export function aliasHits(tokens: string[], candidate: Candidate, names: NameIndex): string[] {
  const channel = candidate.channelName.trim().toUpperCase()
  const cast = new Set(candidate.cast)
  const hits = new Set<string>()
  for (const t of tokens) {
    for (const e of names.get(t) ?? []) {
      if (cast.has(e.icgId) && (e.channel === null || e.channel === channel)) hits.add(e.icgId)
    }
  }
  return [...hits]
}

export type FolderInput = {
  folderName: string
  parsedShortName: string | null
  parsedTitle: string | null
}

export type Weighed = { candidate: Candidate; signals: Signals; tier: Tier; score: number; hits: string[] }

export type FolderMatch = {
  tier: Tier
  winners: Weighed[]
  best: Weighed
  /** Who the folder's alias names, when that is exactly one cast member of the winners */
  aliasPick: string | null
  ambiguous: boolean
  demotions: string[]
} | null

/** Weigh every candidate of a folder's date and pick the strongest — or report the tie */
export function matchFolderByEvidence(
  folder: FolderInput,
  candidates: Candidate[],
  channels: ChannelMaps,
  names: NameIndex,
): FolderMatch {
  if (candidates.length === 0) return null
  const archiveChannel = folder.parsedShortName
    ? (channels.byShort.get(folder.parsedShortName.trim().toUpperCase()) ?? null)
    : null
  const catalogueChannel = (c: Candidate) => channels.byAlias.get(c.channelName.trim().toUpperCase()) ?? null
  const folderTitle = normalizeTitle(folder.parsedTitle ?? folder.folderName)
  const rawToken = parseFolderParticipantRaw(folder.folderName)
  const tokens = aliasTokens(rawToken)

  const channelAgrees = (c: Candidate) => {
    const cat = catalogueChannel(c)
    return Boolean(archiveChannel && cat && cat.id === archiveChannel.id)
  }
  const onChannel = candidates.filter(channelAgrees).length

  const weighed: Weighed[] = []
  for (const candidate of candidates) {
    const hits = aliasHits(tokens, candidate, names)
    const signals: Signals = {
      channel: channelAgrees(candidate),
      alias: hits.length > 0,
      title: folderTitle ? titleSimilarity(folderTitle, normalizeTitle(candidate.title)) : 0,
      onlyOnChannel: onChannel === 1,
    }
    const tier = evidenceTier(signals)
    if (tier) weighed.push({ candidate, signals, tier, score: evidenceScore(signals), hits })
  }
  if (weighed.length === 0) return null

  const top = Math.max(...weighed.map((w) => TIER_RANK[w.tier] * 10 + w.score))
  const winners = weighed.filter((w) => Math.abs(TIER_RANK[w.tier] * 10 + w.score - top) <= 1e-9)
  const best = winners[0]
  const casts = new Set(winners.map((w) => w.candidate.cast.join(',')))
  const picks = new Set(winners.flatMap((w) => w.hits))
  const aliasPick = picks.size === 1 ? [...picks][0] : null
  const ambiguous = casts.size > 1

  const demotions: string[] = []
  const cat = catalogueChannel(best.candidate)
  if (folder.parsedShortName) {
    if (!cat || !archiveChannel) demotions.push('UNKNOWN_CHANNEL')
    else if (cat.id !== archiveChannel.id && cat.labelId && archiveChannel.labelId && cat.labelId !== archiveChannel.labelId) {
      demotions.push('CROSS_LABEL')
    }
  }
  if (ambiguous && !aliasTokenLooksMulti(rawToken) && !aliasPick) demotions.push('AMBIGUOUS')
  if (best.candidate.viaAltDate) demotions.push('DATE_VARIANT')

  return { tier: best.tier, winners, best, aliasPick, ambiguous, demotions }
}

/** Everyone the winning candidates name — the actual suggestion for a folder */
export function suggestedCast(match: NonNullable<FolderMatch>): string[] {
  return [...new Set(match.winners.flatMap((w) => w.candidate.cast))]
}

// ── Reading the database ─────────────────────────────────────────────────────

type FolderRow = FolderInput & { id: string; parsedDate: Date | null }

type SetRow = {
  coverId: string
  date: string | null
  altDates: string[]
  channelName: string
  title: string
  castIcgIds: string[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** A catalogue set as candidate on each of its dates that a folder in the chunk carries */
export function toCandidates(row: SetRow, dates: Set<string>): Candidate[] {
  const base = { coverId: row.coverId, channelName: row.channelName, title: row.title, cast: [...row.castIcgIds].sort() }
  const out: Candidate[] = []
  if (row.date && dates.has(row.date)) out.push({ ...base, date: row.date, viaAltDate: false })
  for (const alt of row.altDates) {
    if (alt !== row.date && dates.has(alt)) out.push({ ...base, date: alt, viaAltDate: true })
  }
  return out
}

async function loadChannels(): Promise<ChannelMaps> {
  const rows = await prisma.channel.findMany({ select: { id: true, shortName: true, labelId: true, importAliases: true } })
  const byAlias = new Map<string, ChannelRef>()
  const byShort = new Map<string, ChannelRef>()
  for (const c of rows) {
    const ref = { id: c.id, labelId: c.labelId }
    for (const a of c.importAliases) byAlias.set(a.trim().toUpperCase(), ref)
    if (c.shortName) byShort.set(c.shortName.trim().toUpperCase(), ref)
  }
  return { byAlias, byShort }
}

/** Every name the app knows for anyone with an ICG-ID — Contacts (catalogue name, AKA, channel aliases) and Persons */
async function loadNames(): Promise<{ index: NameIndex; display: Map<string, string> }> {
  const index: NameIndex = new Map()
  const display = new Map<string, string>()
  const [contacts, channelAliases, persons] = await Promise.all([
    prisma.contact.findMany({
      where: { icgId: { not: null } },
      select: { icgId: true, name: true, catalogueName: true, aka: true },
    }),
    prisma.$queryRaw<{ icgId: string; channelName: string; alias: string }[]>`
      SELECT c."icgId", a."channelName", a.alias
      FROM contact_channel_alias a JOIN "PersonRef" c ON c.id = a."contactId"
      WHERE c."icgId" IS NOT NULL`,
    prisma.person.findMany({ select: { icgId: true, aliases: { select: { name: true, isCommon: true } } } }),
  ])
  for (const c of contacts) {
    const icgId = c.icgId!
    display.set(icgId, c.name)
    for (const n of [c.name, c.catalogueName, ...c.aka]) if (n) addName(index, n, icgId, null)
  }
  for (const a of channelAliases) addName(index, a.alias, a.icgId, a.channelName.trim().toUpperCase())
  for (const p of persons) {
    const common = p.aliases.find((a) => a.isCommon)
    if (common) display.set(p.icgId, common.name)
    for (const a of p.aliases) addName(index, a.name, p.icgId, null)
  }
  return { index, display }
}

function scopeWhere(scope: CatalogueMatchScope): Prisma.ArchiveFolderWhereInput {
  if (scope.kind === 'discoveredSince') return { AND: [UNSETTLED_FOLDER, { discoveredAt: { gte: scope.since } }] }
  if (scope.kind === 'folders') return { AND: [UNSETTLED_FOLDER, { id: { in: scope.ids } }] }
  return UNSETTLED_FOLDER
}

type SuggestionRow = Prisma.ArchiveFolderSuggestionCreateManyInput

/** Replace the CATALOGUE suggestions of these folders, in one transaction */
async function writeSuggestions(folderIds: string[], rows: SuggestionRow[]) {
  if (folderIds.length === 0) return
  await prisma.$transaction(async (tx) => {
    await tx.archiveFolderSuggestion.deleteMany({ where: { archiveFolderId: { in: folderIds }, source: 'CATALOGUE' } })
    if (rows.length) await tx.archiveFolderSuggestion.createMany({ data: rows, skipDuplicates: true })
  })
}

/** Match the folders in scope against the catalogue set table and store the suggestions */
export async function matchArchiveToCatalogue(scope: CatalogueMatchScope = { kind: 'all' }): Promise<CatalogueMatchResult> {
  const started = Date.now()
  const folders: FolderRow[] = await prisma.archiveFolder.findMany({
    where: scopeWhere(scope),
    select: { id: true, folderName: true, parsedDate: true, parsedShortName: true, parsedTitle: true },
    orderBy: { parsedDate: 'asc' },
  })
  const result: CatalogueMatchResult = {
    at: new Date().toISOString(),
    scope: scope.kind,
    folders: folders.length,
    matched: 0,
    byTier: { EXACT: 0, STRONG: 0, WEAK: 0 },
    demoted: 0,
    suggestions: 0,
    durationMs: 0,
  }

  // A folder without a date can match nothing: whatever it had is withdrawn
  await writeSuggestions(folders.filter((f) => !f.parsedDate).map((f) => f.id), [])

  const byDate = new Map<string, FolderRow[]>()
  for (const f of folders) {
    if (!f.parsedDate) continue
    const d = iso(f.parsedDate)
    const bucket = byDate.get(d)
    if (bucket) bucket.push(f)
    else byDate.set(d, [f])
  }
  const allDates = [...byDate.keys()]
  const [channels, names] = allDates.length ? await Promise.all([loadChannels(), loadNames()]) : [null, null]

  for (let i = 0; i < allDates.length; i += DATES_PER_CHUNK) {
    const dates = allDates.slice(i, i + DATES_PER_CHUNK)
    const dateSet = new Set(dates)
    const rows = await prisma.$queryRaw<SetRow[]>`
      SELECT "coverId", to_char(date, 'YYYY-MM-DD') AS date,
             ARRAY(SELECT to_char(a, 'YYYY-MM-DD') FROM unnest("altDates") a) AS "altDates",
             "channelName", title, "castIcgIds"
      FROM catalogue_set
      WHERE date = ANY(${dates}::date[]) OR "altDates" && ${dates}::date[]`
    const onDate = new Map<string, Candidate[]>()
    for (const row of rows) {
      for (const c of toCandidates(row, dateSet)) {
        const bucket = onDate.get(c.date)
        if (bucket) bucket.push(c)
        else onDate.set(c.date, [c])
      }
    }

    const chunkFolders = dates.flatMap((d) => byDate.get(d) ?? [])
    const suggestionRows: SuggestionRow[] = []
    for (const folder of chunkFolders) {
      const match = matchFolderByEvidence(folder, onDate.get(iso(folder.parsedDate!)) ?? [], channels!, names!.index)
      if (!match) continue
      const cast = suggestedCast(match)
      if (cast.length === 0) continue
      result.matched++
      result.byTier[match.tier]++
      if (match.demotions.length) result.demoted++
      const { candidate, signals } = match.best
      for (const icgId of cast) {
        suggestionRows.push({
          archiveFolderId: folder.id,
          icgId,
          name: names!.display.get(icgId) ?? icgId,
          source: 'CATALOGUE',
          tier: match.tier,
          score: match.best.score,
          demotions: match.demotions,
          evidence: {
            folderName: folder.folderName,
            aliasToken: parseFolderParticipantRaw(folder.folderName),
            matchedTitle: candidate.title,
            matchedChannel: candidate.channelName,
            matchedDate: candidate.date,
            matchedCoverId: candidate.coverId,
            channelAgrees: signals.channel,
            aliasAgrees: signals.alias,
            titleSimilarity: Math.round(signals.title * 1000) / 1000,
            namedByAlias: match.aliasPick === icgId,
            candidates: new Set(match.winners.map((w) => w.candidate.cast.join(','))).size,
          },
        })
        result.suggestions++
      }
    }
    await writeSuggestions(chunkFolders.map((f) => f.id), suggestionRows)
  }

  result.durationMs = Date.now() - started
  await setSetting(MATCH_SETTING, JSON.stringify(result))
  return result
}

// ── Running it in the background ─────────────────────────────────────────────

const running = new Map<string, Promise<void>>()
const pending = new Map<string, CatalogueMatchScope>()

/** Two requests waiting on one pass become one: everything wins over a part, the earlier "since" wins */
export function mergeScopes(a: CatalogueMatchScope | undefined, b: CatalogueMatchScope): CatalogueMatchScope {
  if (!a) return b
  if (a.kind === 'all' || b.kind === 'all') return { kind: 'all' }
  if (a.kind === 'discoveredSince' && b.kind === 'discoveredSince') {
    return { kind: 'discoveredSince', since: a.since < b.since ? a.since : b.since }
  }
  if (a.kind === 'folders' && b.kind === 'folders') return { kind: 'folders', ids: [...new Set([...a.ids, ...b.ids])] }
  return { kind: 'all' }
}

/**
 * Match in the background — after an archive scan (new folders), a catalogue run
 * or its Undo (everything unsettled), or on request. One pass per tenant at a
 * time; requests arriving meanwhile are merged into the next pass.
 */
export function requestCatalogueMatch(tenantId: string, scope: CatalogueMatchScope): void {
  if (running.has(tenantId)) {
    pending.set(tenantId, mergeScopes(pending.get(tenantId), scope))
    return
  }
  const pass = runWithTenant(tenantId, () => matchArchiveToCatalogue(scope))
    .then(() => undefined)
    .catch((err) => console.error(`[catalogue-match] ${tenantId} failed:`, err))
    .finally(() => {
      running.delete(tenantId)
      const next = pending.get(tenantId)
      if (next) {
        pending.delete(tenantId)
        requestCatalogueMatch(tenantId, next)
      }
    })
  running.set(tenantId, pass)
}

export type CatalogueMatchStatus = { running: boolean; last: CatalogueMatchResult | null }

export async function getCatalogueMatchStatus(tenantId: string): Promise<CatalogueMatchStatus> {
  const raw = await getSetting(MATCH_SETTING)
  let last: CatalogueMatchResult | null = null
  try {
    last = raw ? (JSON.parse(raw) as CatalogueMatchResult) : null
  } catch {
    last = null
  }
  return { running: running.has(tenantId), last }
}
