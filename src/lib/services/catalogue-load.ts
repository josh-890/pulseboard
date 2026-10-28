/**
 * The catalogue load (ADR-0038, S3) — pure logic, shared by the load service
 * and its tests.
 *
 * One folder is judged exactly as the inventory judged it (inspectFolder: the
 * app's own parser, quarantine Q1–Q5, flags F1–F6) and then read for what the
 * register keeps: her identity and lookup aids, her aliases per channel, and her
 * sets. The newest file wins; older files fill gaps (sets and aliases are the
 * union) and where they disagree on a set, the disagreement is kept.
 *
 * A set is one row per CoverId across every file that lists it: the cast is the
 * union, title / date / channel come from the newest file, and what other files
 * said differently is recorded — the archive matcher tries every date.
 */
import { ICG_ID_RE } from '@/lib/icg-id'
import { resolveNationalityToIoc } from '@/lib/constants/countries'
import {
  inspectFolder,
  isQuarantine,
  tryParse,
  versionsOf,
  type FolderInput,
  type FolderRecord,
  type Problem,
} from '@/lib/services/catalogue-inventory'

export type LoadFolderInput = FolderInput & {
  /** Import file names, sizes and times plus image names — the change detector */
  signature: string
}

export type CatalogueIdentity = {
  icgId: string
  /** The name in her own file */
  name: string
  aka: string[]
  birthYear: number | null
  /** IOC code */
  nationality: string | null
  /** YYYY-MM-DD from the newest file's name */
  catalogueDate: string | null
}

export type SetDisagreements = { title?: string[]; channel?: string[] }

export type CatalogueSetRow = {
  coverId: string
  /** YYYY-MM-DD; null when the source says 0000-00-00 */
  date: string | null
  altDates: string[]
  channelName: string
  title: string
  isVideo: boolean
  castIcgIds: string[]
  disagreements: SetDisagreements | null
  /** Date of the newest file that gave title, date and channel */
  sourceDate: string | null
}

export type ExtractedFolder = {
  record: FolderRecord
  quarantined: boolean
  /** null when quarantined */
  identity: CatalogueIdentity | null
  aliases: { channelName: string; alias: string }[]
  sets: CatalogueSetRow[]
  newestFile: { name: string; content: string } | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A set's release date, or null for 0000-00-00 and anything not a real day */
export function setDate(value: string | null | undefined): string | null {
  if (!value || !DATE_RE.test(value) || value.startsWith('0000')) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value
}

function addDistinct(list: string[] | undefined, ...values: string[]): string[] {
  const out = [...(list ?? [])]
  for (const v of values) if (v && !out.includes(v)) out.push(v)
  return out
}

function noteDisagreement(row: CatalogueSetRow, other: { date: string | null; title: string; channelName: string }) {
  if (other.date && other.date !== row.date && !row.altDates.includes(other.date)) row.altDates.push(other.date)
  const d: SetDisagreements = { ...(row.disagreements ?? {}) }
  if (other.title && other.title !== row.title) d.title = addDistinct(d.title, row.title, other.title)
  if (other.channelName && other.channelName !== row.channelName) d.channel = addDistinct(d.channel, row.channelName, other.channelName)
  row.disagreements = d.title || d.channel ? d : null
}

/**
 * Merge what one file says about a set into the row the register holds.
 * Newest wins title, date and channel; the cast is the union; anything that
 * differs is kept as a disagreement, never dropped.
 */
export function mergeCatalogueSet(existing: CatalogueSetRow | null, incoming: CatalogueSetRow): CatalogueSetRow {
  if (!existing) return { ...incoming, altDates: [...incoming.altDates], castIcgIds: [...incoming.castIcgIds] }
  const incomingWins = (incoming.sourceDate ?? '') >= (existing.sourceDate ?? '')
  const [winner, other] = incomingWins ? [incoming, existing] : [existing, incoming]
  const row: CatalogueSetRow = {
    ...winner,
    altDates: [...new Set([...existing.altDates, ...incoming.altDates])].filter((d) => d !== winner.date),
    castIcgIds: [...new Set([...existing.castIcgIds, ...incoming.castIcgIds])],
    disagreements: mergeDisagreements(existing.disagreements, incoming.disagreements),
    sourceDate: winner.sourceDate,
  }
  noteDisagreement(row, other)
  return row
}

function mergeDisagreements(a: SetDisagreements | null, b: SetDisagreements | null): SetDisagreements | null {
  if (!a && !b) return null
  const title = addDistinct(a?.title, ...(b?.title ?? []))
  const channel = addDistinct(a?.channel, ...(b?.channel ?? []))
  const out: SetDisagreements = {}
  if (title.length) out.title = title
  if (channel.length) out.channel = channel
  return out.title || out.channel ? out : null
}

function birthYearOf(value: string | null): number | null {
  const y = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isInteger(y) && y > 1900 && y < 2100 ? y : null
}

/**
 * One folder, as the load keeps it. `duplicate` marks a folder whose ICG-ID
 * another folder carries too (Q5): quarantined, because no folder is known to
 * be the right one.
 */
export function extractFolder(input: FolderInput, opts: { duplicate?: boolean } = {}): ExtractedFolder {
  const record = inspectFolder(input)
  if (opts.duplicate && record.dirIcgId) {
    record.problems.unshift({ code: 'Q5', detail: `${record.dirIcgId} is in another catalogue folder too` })
  }
  const quarantined = record.problems.some((p: Problem) => isQuarantine(p.code))
  if (quarantined) record.problems = record.problems.filter((p) => isQuarantine(p.code))

  const versions = versionsOf(input.importFiles).filter((v) => v.file.content)
  const newest = versions[0]
  const newestFile = newest?.file.content ? { name: newest.name, content: newest.file.content } : null
  if (quarantined || !record.fileIcgId || !newest) {
    return { record, quarantined: true, identity: null, aliases: [], sets: [], newestFile }
  }

  const icgId = record.fileIcgId
  const aliases = new Map<string, { channelName: string; alias: string }>()
  const sets = new Map<string, CatalogueSetRow>()
  let identity: CatalogueIdentity | null = null

  // Newest first: the newest file wins, older files fill gaps
  for (const v of versions) {
    const parsed = tryParse(v.file.content!)
    if (!parsed) continue
    if (!identity) {
      identity = {
        icgId,
        name: parsed.person.name?.trim() || record.name,
        aka: [...new Set(parsed.person.aliases.map((a) => a.trim()).filter((a) => a && a !== parsed.person.name))],
        birthYear: birthYearOf(parsed.person.birthYear),
        nationality: parsed.person.nationality ? resolveNationalityToIoc(parsed.person.nationality) : null,
        catalogueDate: v.date,
      }
    }
    for (const c of parsed.channelAppearances) {
      const channelName = c.channelName.trim()
      const alias = c.aliasOnChannel.trim()
      if (channelName && alias) aliases.set(`${channelName}|${alias}`, { channelName, alias })
    }
    for (const s of parsed.sets) {
      if (!s.externalId) continue
      const cast = [...new Set([icgId, ...s.modelsList.map((m) => m.icgId).filter((id) => ICG_ID_RE.test(id))])]
      const incoming: CatalogueSetRow = {
        coverId: s.externalId,
        date: setDate(s.date),
        altDates: [],
        channelName: s.channelName.trim(),
        title: s.title.trim(),
        isVideo: s.isVideo,
        castIcgIds: cast,
        disagreements: null,
        sourceDate: v.date,
      }
      sets.set(s.externalId, mergeCatalogueSet(sets.get(s.externalId) ?? null, incoming))
    }
  }

  return {
    record,
    quarantined: false,
    identity,
    aliases: [...aliases.values()],
    sets: [...sets.values()],
    newestFile,
  }
}

/** ICG-IDs carried by more than one folder name (Q5), from the folder index the agent sends */
export function duplicateFolderIcgIds(folders: { path: string; dirIcgId: string | null }[]): Set<string> {
  const seen = new Map<string, number>()
  for (const f of folders) if (f.dirIcgId) seen.set(f.dirIcgId, (seen.get(f.dirIcgId) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id))
}
