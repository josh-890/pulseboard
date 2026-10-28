/**
 * The read-only inventory of the person catalogue (ADR-0038). Pure logic, shared
 * by the agent (scripts/catalogue-inventory.ts) and its tests.
 *
 * Before a single catalogue person becomes a Contact, every folder is judged the
 * way the app would judge it — with the app's own parser — and sorted into the
 * problem kinds the user agreed: quarantine (no Contact), flag (identity taken,
 * the broken part marked) and info (overlap with what the app already holds).
 * The aggregate answers the go/no-go questions: data health, overlap, payoff for
 * set promotion, payoff for archive and network, and the projected cost.
 */
import { ICG_ID_RE } from '@/lib/icg-id'
import {
  checkParseCoverage,
  parseFilename,
  parseImportFile,
  type ParsedImportData,
} from '@/lib/services/import/parser'
import { parseClaimedStats } from '@/lib/services/import/parse-claimed-stats'
import { normalizeTitle, parsePersonDir } from '@/lib/services/catalogue-join'

// ── Problem kinds ────────────────────────────────────────────────────────────

export const PROBLEM_KINDS = {
  Q1: { severity: 'quarantine', title: 'No import file in _meta' },
  Q2: { severity: 'quarantine', title: 'Import file unreadable' },
  Q3: { severity: 'quarantine', title: 'No or malformed ICG-ID' },
  Q4: { severity: 'quarantine', title: 'ICG-IDs disagree (folder / file name / file)' },
  Q5: { severity: 'quarantine', title: 'Same ICG-ID in several folders' },
  F1: { severity: 'flag', title: 'Header polluted (HTML, repeated keys)' },
  F2: { severity: 'flag', title: 'Section cut off or empty' },
  F3: { severity: 'flag', title: 'Name mangled (broken special characters)' },
  F4: { severity: 'flag', title: 'Portrait missing, ambiguous or unreadable' },
  F5: { severity: 'flag', title: 'Cover image unreadable' },
  F6: { severity: 'flag', title: 'Older file version holds more' },
} as const

export type ProblemCode = keyof typeof PROBLEM_KINDS
export const PROBLEM_CODES = Object.keys(PROBLEM_KINDS) as ProblemCode[]

export type Problem = {
  code: ProblemCode
  detail: string
  /** 1-based line in the newest import file, when the problem has one */
  line?: number
  example?: string
}

export const isQuarantine = (code: ProblemCode) => PROBLEM_KINDS[code].severity === 'quarantine'

// ── Folder input (what the agent read from disk) ─────────────────────────────

export type ImportFileInput = {
  name: string
  /** null when the file could not be read at all */
  content: string | null
  readError?: string
}

export type ImageEntry = { name: string; size: number }

export type CoverCheck = { file: string; problem: string | null }

export type FolderInput = {
  /** Path relative to the catalogue root, `<Initial>\<Name_(ICG-ID)>` */
  path: string
  dirName: string
  /** Extension-less files in `_meta` — the import file candidates */
  importFiles: ImportFileInput[]
  /** Images directly in `_meta`, then directly in the person folder (portrait candidates) */
  metaImages: ImageEntry[]
  personImages: ImageEntry[]
  /** Images in `_meta\_Cover` and `_meta\_Videos` */
  covers: number
  coverChecks: CoverCheck[]
}

export type PortraitPick =
  | { kind: 'keyed' | 'single'; file: string }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; files: string[] }

export type FolderRecord = {
  path: string
  dirName: string
  name: string
  /** The identity — null when the folder is quarantined */
  icgId: string | null
  dirIcgId: string | null
  fileIcgId: string | null
  newestFile: string | null
  newestDate: string | null
  versions: number
  /** Channel aliases (`channel|alias`) — union over every version */
  aliases: string[]
  /** Normalised names this person is known by: name, AKA, channel aliases */
  nameKeys: string[]
  /** Set CoverIds — union over every version */
  setIds: string[]
  setsInNewest: number
  coModelIds: string[]
  portrait: PortraitPick
  covers: number
  coversSampled: number
  problems: Problem[]
}

// ── Checks on one file ───────────────────────────────────────────────────────

const HEADER_KEYS = [
  'URL:',
  'Name (extrahiert):',
  'Slug:',
  'ICGID',
  'AKA',
  'Born',
  'Birthplace',
  'First Seen',
  'Measurements',
  'Height',
  'Breasts',
  'Hair Colour',
] as const

const HTML_RE = /<\/?[a-z][a-z0-9]*(\s[^>]*)?>|\b(class|href|title)="/i

/**
 * HTML spilled into the header, or a header key repeated. The parser already
 * takes the first of each key (fa19569), so the identity survives — but the
 * header holds junk, and Biography usually carries the page it came from.
 */
export function headerPollution(content: string): Problem | null {
  const lines = content.split('\n')
  const seen = new Map<string, number>()
  let repeats = 0
  let firstLine: number | undefined
  let example: string | undefined
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t.startsWith("=== Links aus 'Other Links' ===") || /^Channel\s*:/.test(t) || /^Titeltxt\s*:/.test(t)) break
    const key = HEADER_KEYS.find((k) => t.startsWith(k))
    const html = HTML_RE.test(t)
    if (key) {
      seen.set(key, (seen.get(key) ?? 0) + 1)
      if ((seen.get(key) ?? 0) > 1) repeats++
    }
    if ((html || (key && (seen.get(key) ?? 0) > 1)) && firstLine === undefined) {
      firstLine = i + 1
      example = t.slice(0, 160)
    }
  }
  if (firstLine === undefined) return null
  const keys = [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k.replace(/:$/, '')} ×${n}`)
  return {
    code: 'F1',
    detail: keys.length ? `repeated header keys: ${keys.join(', ')} (${repeats} extra lines)` : 'HTML in the header',
    line: firstLine,
    example,
  }
}

/** Broken special characters: the replacement character, or UTF-8 read as Latin-1 */
export function looksMangled(name: string): boolean {
  return /�/.test(name) || /Ã[\u0080-¿]|Â[\u0080-¿ ]|â€/.test(name) || /\?/.test(name)
}

function lineOf(content: string, re: RegExp): number | undefined {
  const lines = content.split('\n')
  const i = lines.findIndex((l) => re.test(l.trim()))
  return i === -1 ? undefined : i + 1
}

/**
 * A biography claims far more than the file lists. Only a strong gap is reported:
 * the site's own counts include sets it no longer lists, so a few missing sets
 * are normal and say nothing about the scrape.
 */
export const CLAIM_GAP_MIN = 10
export const CLAIM_GAP_RATIO = 0.5

// ── Portrait selection (same rules as catalogue-avatar.ps1, Select-Portrait) ──

/**
 * Prefer an image whose name carries this person's ICG-ID (the smaller one when
 * several do); take an unnamed one only when it is the only image; never guess
 * between several. `_meta` first, then the person folder.
 */
export function selectPortrait(dirs: ImageEntry[][], icgId: string | null): PortraitPick {
  let ambiguous: string[] | null = null
  for (const files of dirs) {
    if (files.length === 0) continue
    const keyed = icgId ? files.filter((f) => f.name.includes(`(${icgId})`)) : []
    if (keyed.length > 0) {
      const best = [...keyed].sort((a, b) => a.size - b.size)[0]
      return { kind: 'keyed', file: best.name }
    }
    if (files.length === 1) return { kind: 'single', file: files[0].name }
    ambiguous ??= files.map((f) => f.name)
  }
  return ambiguous ? { kind: 'ambiguous', files: ambiguous } : { kind: 'missing' }
}

// ── Image structure (the fallback when no full decoder is available) ─────────

/**
 * What is wrong with an image file, judged from its structure: the format's
 * signature, a JPEG's segment chain up to the scan and its end marker, a PNG's
 * IEND, a WebP's RIFF length. It catches the common damage (cut-off copies,
 * zero-filled or mislabelled files) — not every corrupt scan line, which needs a
 * full decode. Returns null when the structure is sound.
 */
export function imageStructureProblem(buf: Uint8Array): string | null {
  if (buf.length === 0) return 'empty file'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2
    let sawScan = false
    while (p < buf.length) {
      if (buf[p] !== 0xff) return `JPEG segment chain broken at byte ${p}`
      while (p < buf.length && buf[p] === 0xff) p++
      if (p >= buf.length) return 'JPEG cut off'
      const marker = buf[p++]
      if (marker === 0xd9) return null
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue
      if (p + 2 > buf.length) return 'JPEG cut off'
      const len = (buf[p] << 8) | buf[p + 1]
      if (len < 2 || p + len > buf.length) return 'JPEG cut off (a segment runs past the end)'
      p += len
      if (marker === 0xda) {
        sawScan = true
        break
      }
    }
    if (!sawScan) return 'JPEG has no image data'
    // The end marker, allowing the trailing padding some writers add
    let end = buf.length - 1
    while (end > p && buf[end] === 0x00) end--
    return buf[end - 1] === 0xff && buf[end] === 0xd9 ? null : 'JPEG cut off (no end marker)'
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const tail = Buffer.from(buf.subarray(Math.max(0, buf.length - 12))).toString('latin1')
    return tail.includes('IEND') ? null : 'PNG cut off (no IEND)'
  }
  if (buf.length >= 12 && Buffer.from(buf.subarray(0, 4)).toString('latin1') === 'RIFF') {
    const declared = (buf[4] | (buf[5] << 8) | (buf[6] << 16) | (buf[7] << 24)) >>> 0
    return declared + 8 <= buf.length ? null : 'WebP cut off'
  }
  return 'not an image (unknown format)'
}

/** Every 20th cover by a stable hash of its path — the same ~5 % on every run */
export function inCoverSample(file: string): boolean {
  let h = 2166136261
  for (let i = 0; i < file.length; i++) h = Math.imul(h ^ file.charCodeAt(i), 16777619)
  // FNV's low bits barely move between paths that differ in a digit or two; mix before the modulo
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) % 20 === 0
}

// ── One folder ───────────────────────────────────────────────────────────────

export const nameKey = (v: string) => normalizeTitle(v)

type Version = { name: string; date: string; nameIcg: string | null; file: ImportFileInput }

function versionsOf(files: ImportFileInput[]): Version[] {
  return files
    .flatMap((f) => {
      const meta = parseFilename(f.name)
      return meta.extractionDate && meta.icgId ? [{ name: f.name, date: meta.extractionDate, nameIcg: meta.icgId, file: f }] : []
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

function tryParse(content: string): ParsedImportData | null {
  try {
    return parseImportFile(content)
  } catch {
    return null
  }
}

const aliasKeys = (p: ParsedImportData) =>
  p.channelAppearances.map((c) => `${c.channelName}|${c.aliasOnChannel}`)

export function inspectFolder(input: FolderInput): FolderRecord {
  const problems: Problem[] = []
  const dir = parsePersonDir(input.dirName)
  const dirIcg = dir?.icgId ?? null
  const versions = versionsOf(input.importFiles)
  const newest = versions[0] ?? null

  const record: FolderRecord = {
    path: input.path,
    dirName: input.dirName,
    name: dir?.name ?? input.dirName,
    icgId: null,
    dirIcgId: dirIcg,
    fileIcgId: null,
    newestFile: newest?.name ?? null,
    newestDate: newest?.date ?? null,
    versions: versions.length,
    aliases: [],
    nameKeys: [],
    setIds: [],
    setsInNewest: 0,
    coModelIds: [],
    portrait: { kind: 'missing' },
    covers: input.covers,
    coversSampled: input.coverChecks.length,
    problems,
  }

  const finish = () => {
    record.portrait = selectPortrait([input.metaImages, input.personImages], dirIcg ?? record.fileIcgId)
    if (record.portrait.kind === 'missing') problems.push({ code: 'F4', detail: 'no portrait in _meta or the person folder' })
    if (record.portrait.kind === 'ambiguous') {
      problems.push({ code: 'F4', detail: `several images, none named (${dirIcg ?? '?'}): ${record.portrait.files.slice(0, 4).join(', ')}` })
    }
    for (const c of input.coverChecks) if (c.problem) problems.push({ code: 'F5', detail: c.problem, example: c.file })
    return record
  }

  if (!newest) {
    const stray = input.importFiles.map((f) => f.name)
    problems.push({
      code: 'Q1',
      detail: stray.length ? `no file named YYYY-MM-DD_Name_(ICG-ID); found: ${stray.slice(0, 3).join(', ')}` : 'no extension-less file in _meta',
    })
    return finish()
  }

  const content = newest.file.content
  if (content === null) {
    problems.push({ code: 'Q2', detail: newest.file.readError ?? 'could not be read', example: newest.name })
    return finish()
  }
  if (!content.trim()) {
    problems.push({ code: 'Q2', detail: 'empty file', example: newest.name })
    return finish()
  }
  const parsed = tryParse(content)
  if (!parsed) {
    problems.push({ code: 'Q2', detail: 'the parser failed on this file', example: newest.name })
    return finish()
  }
  if (!parsed.person.icgId && !parsed.person.name && parsed.sets.length === 0) {
    problems.push({ code: 'Q2', detail: 'nothing recognisable (no ICGID, name or set)', example: newest.name })
    return finish()
  }

  const fileIcg = parsed.person.icgId || null
  record.fileIcgId = fileIcg
  if (parsed.person.name) record.name = parsed.person.name

  if (!fileIcg || !ICG_ID_RE.test(fileIcg)) {
    problems.push({
      code: 'Q3',
      detail: fileIcg ? `not an ICG-ID: "${fileIcg.slice(0, 60)}"` : 'no ICGID line',
      line: lineOf(content, /^ICGID/),
    })
  } else if (dirIcg && !ICG_ID_RE.test(dirIcg)) {
    problems.push({ code: 'Q3', detail: `folder name carries no valid ICG-ID: "${dirIcg}"` })
  } else {
    const sources = [
      ['folder', dirIcg],
      ['file name', newest.nameIcg],
      ['file', fileIcg],
    ] as const
    if (!dirIcg) {
      problems.push({ code: 'Q4', detail: `folder name carries no ICG-ID to check against (file: ${fileIcg})` })
    } else if (new Set(sources.map(([, v]) => v).filter(Boolean)).size > 1) {
      problems.push({
        code: 'Q4',
        detail: sources.map(([k, v]) => `${k} ${v ?? '—'}`).join(' · '),
        line: lineOf(content, /^ICGID/),
      })
    }
  }

  const quarantined = problems.some((p) => isQuarantine(p.code))
  if (!quarantined) record.icgId = fileIcg

  const pollution = headerPollution(content)
  if (pollution) problems.push(pollution)

  for (const s of checkParseCoverage(content, parsed)) {
    if (s.kind === 'section') problems.push({ code: 'F2', detail: `${s.found} ${s.label} found, none parsed` })
  }
  const claims = parseClaimedStats(parsed.person.biography)
  const claimed = (claims.photosets ?? 0) + (claims.videos ?? 0)
  if (claimed >= CLAIM_GAP_MIN && parsed.sets.length < claimed * CLAIM_GAP_RATIO) {
    problems.push({ code: 'F2', detail: `biography claims ${claimed} sets, the file lists ${parsed.sets.length}` })
  }

  if (looksMangled(record.name) || (dir && looksMangled(dir.name))) {
    problems.push({ code: 'F3', detail: `name reads "${record.name}"`, example: input.dirName })
  }

  // Newest wins; older versions fill gaps (sets and aliases are the union)
  const sets = new Set(parsed.sets.map((s) => s.externalId).filter(Boolean))
  const aliases = new Set(aliasKeys(parsed))
  const names = new Set([parsed.person.name, ...parsed.person.aliases, ...parsed.channelAppearances.map((c) => c.aliasOnChannel)])
  const coModels = new Set(parsed.coModels.map((c) => c.icgId).filter((id) => ICG_ID_RE.test(id)))
  record.setsInNewest = sets.size
  let olderSets = 0
  let olderAliases = 0
  for (const v of versions.slice(1)) {
    const older = v.file.content ? tryParse(v.file.content) : null
    if (!older) continue
    for (const id of older.sets.map((s) => s.externalId).filter(Boolean)) {
      if (!sets.has(id)) {
        sets.add(id)
        olderSets++
      }
    }
    for (const a of aliasKeys(older)) {
      if (!aliases.has(a)) {
        aliases.add(a)
        olderAliases++
      }
    }
    for (const c of older.channelAppearances) names.add(c.aliasOnChannel)
  }
  if (olderSets + olderAliases > 0) {
    const parts = [olderSets && `${olderSets} set(s)`, olderAliases && `${olderAliases} alias(es)`].filter(Boolean)
    problems.push({ code: 'F6', detail: `only in older files: ${parts.join(', ')} (${versions.length} versions)` })
  }

  record.setIds = [...sets]
  record.aliases = [...aliases]
  record.nameKeys = [...new Set([...names].filter(Boolean).map(nameKey).filter(Boolean))]
  record.coModelIds = [...coModels]
  return finish()
}

// ── The app's side ───────────────────────────────────────────────────────────

/** What the app sends (GET /api/catalogue/inventory-context) */
export type InventoryContext = {
  persons: string[]
  contacts: { icgId: string; ignored: boolean; hasThumb: boolean }[]
  /** Portraits the avatar agent has sent: stored, or refused with the reason */
  avatars: { icgId: string; ok: boolean; error: string | null }[]
  staged: {
    open: number
    /** Open staged sets that list no cast at all */
    noCast: number
    /**
     * Open staged sets with a cast member who is not a developed Person — the sets
     * the user leaves alone today. A thin Contact (ICG-ID and name, made by the
     * import for every co-model) does not count as recognisable (ADR-0038 §1).
     */
    waiting: { id: string; title: string; nonPersons: string[] }[]
  }
  size: { databaseBytes: number; contactBytes: number; contactRows: number; avatarRows: number }
}

/** The orphan folders and channel aliases (GET /api/archive/attribution-worklist) */
export type InventoryWorklist = {
  orphans: { archiveKey: string; folderName: string; aliasToken: string | null }[]
  aliases: { nameNorm: string; icgId: string }[]
}

// ── The aggregate ────────────────────────────────────────────────────────────

export type OverlapKind = 'I1' | 'I2' | 'I3' | 'I4'
export const OVERLAP_KINDS: Record<OverlapKind, string> = {
  I1: 'Already a Person → hint only',
  I2: 'Already a Contact → enriched',
  I3: 'An ignored Contact → stays ignored, enriched',
  I4: 'New → becomes a Contact',
}

/** Assumed bytes per row including indexes — stated in the report, not hidden */
export const COST_ASSUMPTIONS = { contactBytes: 700, aliasBytes: 220, setRefBytes: 260, portraitBytes: 25_000 }

export const QUARANTINE_NO_GO = 0.1

export type Inventory = {
  folders: number
  health: { clean: number; partial: number; quarantined: number; quarantineRate: number }
  byProblem: Record<ProblemCode, number>
  /** Folder records with their final problems (Q5 and app-side portrait failures added) */
  records: FolderRecord[]
  overlap: Record<OverlapKind, number> | null
  overlapOf: Map<string, OverlapKind>
  portraits: { found: number; stored: number; refused: number; notYetSent: number } | null
  staged: {
    open: number
    noCast: number
    /** Every cast member a developed Person */
    readyToday: number
    /** A cast member who is not a Person */
    waiting: number
    nonPersonMembers: number
    /** In the catalogue with a valid identity: name, aliases, ICG-ID */
    recognisable: number
    /** … and a portrait */
    withFace: number
    /** Whole cast a Person or recognisable */
    setsUnblocked: number
    sets: { id: string; title: string; nonPersons: string[]; recognisable: string[]; missing: string[] }[]
  } | null
  archive: {
    orphans: number
    withToken: number
    knownToday: number
    gainName: number
    ambiguous: number
    matches: { folderName: string; token: string; candidates: string[] }[]
  } | null
  network: { contactsEnriched: number; contactsGainPortrait: number; coModelsUnknown: number; coModelsBecomeKnown: number } | null
  cost: {
    newContacts: number
    aliasRows: number
    setRefs: number
    distinctSets: number
    newPortraits: number
    estimatedDbBytes: number
    estimatedPortraitBytes: number
    databaseBytes: number | null
  }
  noGo: { quarantine: boolean }
}

export function buildInventory(
  input: FolderRecord[],
  context: InventoryContext | null,
  worklist: InventoryWorklist | null,
): Inventory {
  const records = input.map((r) => ({ ...r, problems: [...r.problems] }))

  // Q5 — the same ICG-ID in several folders: no folder is known to be the right one
  const byIcg = new Map<string, FolderRecord[]>()
  for (const r of records) if (r.icgId) byIcg.set(r.icgId, [...(byIcg.get(r.icgId) ?? []), r])
  for (const [icg, group] of byIcg) {
    if (group.length < 2) continue
    for (const r of group) {
      r.problems.unshift({ code: 'Q5', detail: `${icg} also in: ${group.filter((o) => o !== r).map((o) => o.path).join(' · ')}` })
      r.icgId = null
    }
  }

  const avatarOf = new Map((context?.avatars ?? []).map((a) => [a.icgId, a]))
  let portraitsStored = 0
  let portraitsRefused = 0
  let portraitsNotYet = 0
  let portraitsFound = 0
  for (const r of records) {
    if (r.portrait.kind !== 'keyed' && r.portrait.kind !== 'single') continue
    portraitsFound++
    const id = r.icgId ?? r.dirIcgId
    const a = id ? avatarOf.get(id) : undefined
    if (!a) portraitsNotYet++
    else if (a.ok) portraitsStored++
    else {
      portraitsRefused++
      r.problems.push({ code: 'F4', detail: `the app could not read the portrait: ${a.error ?? 'unknown error'}`, example: r.portrait.file })
    }
  }

  // A quarantined folder lists only why: its flags come back on the run after it is fixed
  for (const r of records) {
    if (r.problems.some((p) => isQuarantine(p.code))) r.problems = r.problems.filter((p) => isQuarantine(p.code))
  }

  const byProblem = Object.fromEntries(PROBLEM_CODES.map((c) => [c, 0])) as Record<ProblemCode, number>
  let clean = 0
  let partial = 0
  let quarantined = 0
  for (const r of records) {
    for (const c of new Set(r.problems.map((p) => p.code))) byProblem[c]++
    if (r.problems.some((p) => isQuarantine(p.code))) quarantined++
    else if (r.problems.length > 0) partial++
    else clean++
  }
  const quarantineRate = records.length ? quarantined / records.length : 0

  const identities = records.filter((r) => r.icgId)
  const catalogueIds = new Set(identities.map((r) => r.icgId!))

  let overlap: Inventory['overlap'] = null
  const overlapOf = new Map<string, OverlapKind>()
  let network: Inventory['network'] = null
  let staged: Inventory['staged'] = null
  let archive: Inventory['archive'] = null

  if (context) {
    const persons = new Set(context.persons)
    const contacts = new Map(context.contacts.map((c) => [c.icgId, c]))
    overlap = { I1: 0, I2: 0, I3: 0, I4: 0 }
    for (const r of identities) {
      const id = r.icgId!
      const c = contacts.get(id)
      const kind: OverlapKind = persons.has(id) ? 'I1' : c ? (c.ignored ? 'I3' : 'I2') : 'I4'
      overlap[kind]++
      overlapOf.set(id, kind)
    }

    const known = (id: string) => persons.has(id) || contacts.has(id)
    const portraitReady = (r: FolderRecord) => r.portrait.kind === 'keyed' || r.portrait.kind === 'single'
    const coUnknown = new Set<string>()
    for (const r of identities) {
      if (overlapOf.get(r.icgId!) !== 'I1') continue
      for (const id of r.coModelIds) if (!known(id)) coUnknown.add(id)
    }
    network = {
      contactsEnriched: overlap.I2 + overlap.I3,
      contactsGainPortrait: identities.filter((r) => {
        const c = contacts.get(r.icgId!)
        return c && !c.hasThumb && portraitReady(r)
      }).length,
      coModelsUnknown: coUnknown.size,
      coModelsBecomeKnown: [...coUnknown].filter((id) => catalogueIds.has(id)).length,
    }

    const faces = new Set(
      identities.filter((r) => portraitReady(r) && avatarOf.get(r.icgId!)?.ok !== false).map((r) => r.icgId!),
    )
    const members = new Set<string>()
    const sets = context.staged.waiting.map((s) => {
      s.nonPersons.forEach((id) => members.add(id))
      return {
        ...s,
        recognisable: s.nonPersons.filter((id) => catalogueIds.has(id)),
        missing: s.nonPersons.filter((id) => !catalogueIds.has(id)),
      }
    })
    const recognisable = [...members].filter((id) => catalogueIds.has(id))
    staged = {
      open: context.staged.open,
      noCast: context.staged.noCast,
      readyToday: context.staged.open - context.staged.noCast - sets.length,
      waiting: sets.length,
      nonPersonMembers: members.size,
      recognisable: recognisable.length,
      withFace: recognisable.filter((id) => faces.has(id)).length,
      setsUnblocked: sets.filter((s) => s.missing.length === 0).length,
      sets,
    }
  }

  if (worklist) {
    const appNames = new Set(worklist.aliases.map((a) => nameKey(a.nameNorm)))
    const catalogueByName = new Map<string, string[]>()
    for (const r of identities) {
      if (overlapOf.get(r.icgId!) === 'I1') continue
      for (const k of r.nameKeys) catalogueByName.set(k, [...(catalogueByName.get(k) ?? []), r.icgId!])
    }
    const matches: { folderName: string; token: string; candidates: string[] }[] = []
    let withToken = 0
    let knownToday = 0
    let ambiguous = 0
    for (const o of worklist.orphans) {
      if (!o.aliasToken) continue
      withToken++
      const key = nameKey(o.aliasToken)
      if (appNames.has(key)) {
        knownToday++
        continue
      }
      const candidates = [...new Set(catalogueByName.get(key) ?? [])]
      if (candidates.length === 0) continue
      if (candidates.length > 1) ambiguous++
      matches.push({ folderName: o.folderName, token: o.aliasToken, candidates })
    }
    archive = { orphans: worklist.orphans.length, withToken, knownToday, gainName: matches.length, ambiguous, matches }
  }

  const growing = identities.filter((r) => overlapOf.get(r.icgId!) !== 'I1')
  const newContacts = context ? growing.filter((r) => overlapOf.get(r.icgId!) === 'I4').length : growing.length
  const aliasRows = growing.reduce((n, r) => n + r.aliases.length, 0)
  const setRefs = growing.reduce((n, r) => n + r.setIds.length, 0)
  const distinctSets = new Set(growing.flatMap((r) => r.setIds)).size
  const newPortraits = growing.filter((r) => {
    if (r.portrait.kind !== 'keyed' && r.portrait.kind !== 'single') return false
    return !avatarOf.get(r.icgId!)?.ok
  }).length

  return {
    folders: records.length,
    health: { clean, partial, quarantined, quarantineRate },
    byProblem,
    records,
    overlap,
    overlapOf,
    portraits: context ? { found: portraitsFound, stored: portraitsStored, refused: portraitsRefused, notYetSent: portraitsNotYet } : null,
    staged,
    archive,
    network,
    cost: {
      newContacts,
      aliasRows,
      setRefs,
      distinctSets,
      newPortraits,
      estimatedDbBytes:
        newContacts * COST_ASSUMPTIONS.contactBytes + aliasRows * COST_ASSUMPTIONS.aliasBytes + setRefs * COST_ASSUMPTIONS.setRefBytes,
      estimatedPortraitBytes: newPortraits * COST_ASSUMPTIONS.portraitBytes,
      databaseBytes: context?.size.databaseBytes ?? null,
    },
    noGo: { quarantine: quarantineRate >= QUARANTINE_NO_GO },
  }
}
