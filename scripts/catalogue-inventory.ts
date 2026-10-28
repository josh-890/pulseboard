#!/usr/bin/env node
/**
 * Person-catalogue inventory — READ-ONLY (ADR-0038).
 *
 * Runs on the machine that holds the person catalogue. Walks
 * `<Initial>/<Common_Name_(ICG-ID)>/_meta/`, judges every folder with the app's
 * own parser, pulls what the app already holds (Persons, Contacts, portraits,
 * staged casts, orphan archive folders), and writes an Excel workbook: a Summary
 * sheet with the go/no-go numbers and one sheet per problem kind — the fix-list.
 *
 * It writes NOTHING to the app. The two requests it makes are GETs.
 *
 * This file is NOT standalone — it imports the shared, unit-tested logic from
 * src/lib/services/catalogue-inventory.ts. Two ways to run it:
 *
 *   From a repo checkout (run from the repo ROOT):
 *     npx tsx scripts/catalogue-inventory.ts --catalogue "H:\Models\thenude" --cache inventory.json
 *
 *   As a single copyable file, for a machine with no checkout:
 *     npm run build:agent          # produces dist-agents/catalogue-inventory.mjs
 *     node catalogue-inventory.mjs --catalogue "H:\Models\thenude" --cache inventory.json
 *
 * Covers are checked on a stable ~5 % sample. With `sharp` importable (a repo
 * checkout, or `npm i sharp` beside the .mjs) each sampled cover is fully
 * decoded, strictly, as the app would; without it only the file's structure is
 * checked (cut off, wrong format). The Summary says which.
 *
 * Flags:
 *   --catalogue DIR  Root of the person catalogue (or PERSON_CATALOGUE_ROOT)
 *   --out FILE       The workbook (default catalogue-inventory-<date>.xlsx)
 *   --cache FILE     Reuse the judged folders instead of re-walking; written on the
 *                    first run. Holds only what is on disk — the app side is
 *                    fetched fresh every run.
 *   --rewalk         Walk again even when --cache exists
 *   --limit N        Only the first N person folders (a quick look; no cache written)
 *   --offline        Don't ask the app: data health and cost only
 *   --base-url URL, --api-key KEY, --tenant ID   Default to the ARCHIVE_* env vars
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import {
  COST_ASSUMPTIONS,
  OVERLAP_KINDS,
  PROBLEM_CODES,
  PROBLEM_KINDS,
  QUARANTINE_NO_GO,
  buildInventory,
  imageStructureProblem,
  inCoverSample,
  inspectFolder,
  isQuarantine,
  type CoverCheck,
  type FolderRecord,
  type ImageEntry,
  type ImportFileInput,
  type Inventory,
  type InventoryContext,
  type InventoryWorklist,
} from '../src/lib/services/catalogue-inventory'

const args = process.argv.slice(2)
const getArg = (flag: string): string | null => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/** A `.env` next to the script, then one in the working directory — as catalogue-join. Existing env wins. */
function loadDotEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const candidate of [path.join(here, '.env'), path.resolve(process.cwd(), '.env')]) {
    let raw: string
    try {
      raw = fs.readFileSync(candidate, 'utf8')
    } catch {
      continue
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!(key in process.env)) process.env[key] = value
    }
  }
}
loadDotEnv()

const CATALOGUE = getArg('--catalogue') || process.env.PERSON_CATALOGUE_ROOT || ''
const BASE_URL = (getArg('--base-url') || process.env.ARCHIVE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const API_KEY = getArg('--api-key') || process.env.ARCHIVE_API_KEY || ''
const TENANT = getArg('--tenant') || process.env.ARCHIVE_TENANT || ''
const LIMIT = Number(getArg('--limit')) || 0
const CACHE = getArg('--cache') || ''
const REWALK = args.includes('--rewalk')
const OFFLINE = args.includes('--offline')
const OUT = getArg('--out') || `catalogue-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`

if (!CATALOGUE) {
  console.error('Error: --catalogue (or PERSON_CATALOGUE_ROOT) is required')
  process.exit(1)
}
if (!OFFLINE && !API_KEY) {
  console.error('Error: --api-key or ARCHIVE_API_KEY is required (or pass --offline)')
  process.exit(1)
}

// ── Cover decoding ───────────────────────────────────────────────────────────

type Decoder = { mode: 'full decode (sharp)' | 'structure only'; check: (buf: Buffer) => Promise<string | null> }

async function loadDecoder(): Promise<Decoder> {
  try {
    const sharp = (await import('sharp')).default
    return {
      mode: 'full decode (sharp)',
      check: async (buf) => {
        const structural = imageStructureProblem(buf)
        if (structural) return structural
        try {
          await sharp(buf, { failOn: 'error' }).raw().toBuffer()
          return null
        } catch (err) {
          return `decode failed: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    }
  } catch {
    return { mode: 'structure only', check: async (buf) => imageStructureProblem(buf) }
  }
}

// ── Walk ─────────────────────────────────────────────────────────────────────

const IMAGE_RE = /\.(jpe?g|png|webp)$/i

function makeTicker(intervalMs = 2000) {
  let last = 0
  return (line: string) => {
    const now = Date.now()
    if (now - last < intervalMs) return
    last = now
    process.stdout.write(`\r${line.padEnd(78).slice(0, 78)}`)
  }
}

function listDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function images(dir: string): ImageEntry[] {
  return listDir(dir)
    .filter((e) => e.isFile() && IMAGE_RE.test(e.name))
    .map((e) => {
      let size = 0
      try {
        size = fs.statSync(path.join(dir, e.name)).size
      } catch {
        // an unreadable image still counts as present; its size only orders keyed portraits
      }
      return { name: e.name, size }
    })
}

async function walk(root: string, decoder: Decoder): Promise<FolderRecord[]> {
  const out: FolderRecord[] = []
  const tick = makeTicker()
  let covers = 0
  for (const bucket of listDir(root).filter((e) => e.isDirectory())) {
    const bucketPath = path.join(root, bucket.name)
    for (const person of listDir(bucketPath).filter((e) => e.isDirectory())) {
      if (LIMIT && out.length >= LIMIT) return out
      const personPath = path.join(bucketPath, person.name)
      const metaPath = path.join(personPath, '_meta')
      tick(`  [${bucket.name}]  ${out.length.toLocaleString()} folders, ${covers.toLocaleString()} covers  —  ${person.name}`)

      const meta = listDir(metaPath)
      const importFiles: ImportFileInput[] = meta
        .filter((e) => e.isFile() && !path.extname(e.name))
        .map((e) => {
          try {
            return { name: e.name, content: fs.readFileSync(path.join(metaPath, e.name), 'utf8') }
          } catch (err) {
            return { name: e.name, content: null, readError: err instanceof Error ? err.message : String(err) }
          }
        })

      const coverFiles = ['_Cover', '_Videos'].flatMap((sub) =>
        images(path.join(metaPath, sub)).map((img) => path.join('_meta', sub, img.name)),
      )
      covers += coverFiles.length
      const coverChecks: CoverCheck[] = []
      for (const rel of coverFiles.filter((f) => inCoverSample(path.join(person.name, f)))) {
        let problem: string | null
        try {
          problem = await decoder.check(fs.readFileSync(path.join(personPath, rel)))
        } catch (err) {
          problem = `unreadable: ${err instanceof Error ? err.message : String(err)}`
        }
        coverChecks.push({ file: rel, problem })
      }

      // One folder that throws costs that folder, never the run
      try {
        out.push(
          inspectFolder({
            path: path.join(bucket.name, person.name),
            dirName: person.name,
            importFiles,
            metaImages: images(metaPath),
            personImages: images(personPath),
            covers: coverFiles.length,
            coverChecks,
          }),
        )
      } catch (err) {
        out.push({
          path: path.join(bucket.name, person.name),
          dirName: person.name,
          name: person.name,
          icgId: null,
          dirIcgId: null,
          fileIcgId: null,
          newestFile: null,
          newestDate: null,
          versions: importFiles.length,
          aliases: [],
          nameKeys: [],
          setIds: [],
          setsInNewest: 0,
          coModelIds: [],
          portrait: { kind: 'missing' },
          covers: coverFiles.length,
          coversSampled: coverChecks.length,
          problems: [{ code: 'Q2', detail: `inspection failed: ${err instanceof Error ? err.message : String(err)}` }],
        })
      }
    }
  }
  process.stdout.write(`\r${' '.repeat(78)}\r`)
  return out
}

// ── App side ─────────────────────────────────────────────────────────────────

async function getJson<T>(route: string): Promise<T> {
  const headers: Record<string, string> = { 'x-archive-key': API_KEY }
  if (TENANT) headers['x-tenant-id'] = TENANT
  const resp = await fetch(`${BASE_URL}${route}`, { headers })
  if (!resp.ok) throw new Error(`${route}: ${resp.status} ${(await resp.text()).slice(0, 200)}`)
  return (await resp.json()) as T
}

// ── Workbook ─────────────────────────────────────────────────────────────────

const pct = (n: number, of: number) => (of === 0 ? '—' : `${((100 * n) / of).toFixed(1)} %`)
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} MB`

function statusOf(r: FolderRecord): string {
  if (r.problems.some((p) => isQuarantine(p.code))) return 'quarantine'
  return r.problems.length ? 'partial' : 'clean'
}

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  // Excel refuses * ? : \ / [ ] in sheet names and anything past 31 characters
  const ws = wb.addWorksheet(name.replace(/[*?:\\/[\]]/g, '-').slice(0, 31))
  ws.columns = columns
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return ws
}

function writeWorkbook(inv: Inventory, meta: { decoder: string; walkedAt: string; covers: number; sampled: number }) {
  const wb = new ExcelJS.Workbook()
  const summary = wb.addWorksheet('Summary')
  summary.columns = [
    { header: '', key: 'a', width: 52 },
    { header: '', key: 'b', width: 18 },
    { header: '', key: 'c', width: 70 },
  ]
  const head = (text: string) => {
    summary.addRow([])
    summary.addRow([text]).font = { bold: true, size: 12 }
  }
  const line = (label: string, value: string | number, note = '') => summary.addRow([label, value, note])

  summary.addRow(['Catalogue inventory (ADR-0038) — read-only']).font = { bold: true, size: 14 }
  line('Catalogue', CATALOGUE)
  line('Walked', meta.walkedAt, CACHE && !REWALK ? `cache ${CACHE}` : '')
  line('App', OFFLINE ? 'offline' : `${BASE_URL}${TENANT ? ` [${TENANT}]` : ''}`)

  head('Go / no-go')
  line(
    'Quarantined folders',
    pct(inv.health.quarantined, inv.folders),
    inv.noGo.quarantine
      ? `FAIL — ${Math.round(QUARANTINE_NO_GO * 100)} % or more: fix the scrapes first, then run again`
      : `PASS — below ${Math.round(QUARANTINE_NO_GO * 100)} %`,
  )
  line('Cost', `${mb(inv.cost.estimatedDbBytes)} DB + ${mb(inv.cost.estimatedPortraitBytes)} portraits`, 'your call — see Cost below; speed is proven later on a full-size dev copy')

  head('Data health')
  line('Person folders', inv.folders)
  line('Clean', inv.health.clean, pct(inv.health.clean, inv.folders))
  line('Partial (identity taken, parts flagged)', inv.health.partial, pct(inv.health.partial, inv.folders))
  line('Quarantined (no Contact)', inv.health.quarantined, pct(inv.health.quarantined, inv.folders))
  for (const code of PROBLEM_CODES) {
    line(`  ${code} ${PROBLEM_KINDS[code].title}`, inv.byProblem[code], inv.byProblem[code] ? `see sheet ${code}` : '')
  }
  line('Covers', meta.covers, `${meta.sampled} sampled (~5 %), checked by ${meta.decoder}`)

  if (inv.overlap) {
    head('Overlap with the app')
    for (const k of Object.keys(OVERLAP_KINDS) as (keyof typeof OVERLAP_KINDS)[]) line(`${k} ${OVERLAP_KINDS[k]}`, inv.overlap[k])
  }
  if (inv.portraits) {
    head('Portraits')
    line('Found on disk', inv.portraits.found)
    line('Stored by the app (catalogue-avatar)', inv.portraits.stored)
    line('Refused by the app (unreadable)', inv.portraits.refused, 'flagged F4')
    line('Not sent yet', inv.portraits.notYetSent, 'run catalogue-avatar.ps1 to have the app check them')
  }
  if (inv.staged) {
    head('Payoff — set promotion')
    line('Open staged sets', inv.staged.open)
    line('… with a cast member the app does not know', inv.staged.withUnknown, pct(inv.staged.withUnknown, inv.staged.open))
    line('Unknown cast members (distinct)', inv.staged.unknownMembers)
    line('… the catalogue makes known', inv.staged.becomeKnown, pct(inv.staged.becomeKnown, inv.staged.unknownMembers))
    line('Sets whose whole cast becomes known', inv.staged.setsFullyKnown, pct(inv.staged.setsFullyKnown, inv.staged.withUnknown))
  }
  if (inv.archive) {
    head('Payoff — archive')
    line('Orphan archive folders', inv.archive.orphans)
    line('… whose name carries a person token', inv.archive.withToken)
    line('… matching an app channel alias today', inv.archive.knownToday)
    line('… that get a catalogue name to match', inv.archive.gainName, pct(inv.archive.gainName, inv.archive.withToken))
    line('… of those, ambiguous (2+ people)', inv.archive.ambiguous, 'a suggestion to decide, never a link')
  }
  if (inv.network) {
    head('Payoff — network')
    line('Contacts enriched', inv.network.contactsEnriched)
    line('Contacts gaining a portrait', inv.network.contactsGainPortrait)
    line("Co-models of your Persons the app doesn't know", inv.network.coModelsUnknown)
    line('… the catalogue makes known', inv.network.coModelsBecomeKnown, pct(inv.network.coModelsBecomeKnown, inv.network.coModelsUnknown))
  }

  head('Cost (projection)')
  line('New Contacts', inv.cost.newContacts)
  line('Channel alias rows', inv.cost.aliasRows)
  line('Set references (per person)', inv.cost.setRefs, `${inv.cost.distinctSets.toLocaleString()} distinct sets`)
  line('Estimated DB growth', mb(inv.cost.estimatedDbBytes), `assumes ${COST_ASSUMPTIONS.contactBytes} B/contact, ${COST_ASSUMPTIONS.aliasBytes} B/alias, ${COST_ASSUMPTIONS.setRefBytes} B/set reference incl. indexes`)
  if (inv.cost.databaseBytes) line('Database today', mb(inv.cost.databaseBytes), `growth = ${pct(inv.cost.estimatedDbBytes, inv.cost.databaseBytes)}`)
  line('Portraits still to store', inv.cost.newPortraits, `≈ ${mb(inv.cost.estimatedPortraitBytes)} at ${COST_ASSUMPTIONS.portraitBytes / 1000} KB each`)

  // One sheet per problem kind — the fix-list
  for (const code of PROBLEM_CODES) {
    if (!inv.byProblem[code]) continue
    const ws = sheet(wb, `${code} ${PROBLEM_KINDS[code].title}`, [
      { header: 'Folder', key: 'path', width: 44 },
      { header: 'ICG-ID (folder)', key: 'dir', width: 14 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Detail', key: 'detail', width: 70 },
      { header: 'Line', key: 'line', width: 7 },
      { header: 'Example', key: 'example', width: 60 },
    ])
    for (const r of inv.records) {
      for (const p of r.problems.filter((x) => x.code === code)) {
        ws.addRow({ path: r.path, dir: r.dirIcgId ?? '', name: r.name, detail: p.detail, line: p.line ?? '', example: p.example ?? '' })
      }
    }
  }

  if (inv.overlap?.I1) {
    const ws = sheet(wb, 'Persons (hint only)', [
      { header: 'ICG-ID', key: 'icg', width: 14 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Newest file', key: 'date', width: 12 },
      { header: 'Sets in it', key: 'sets', width: 10 },
      { header: 'Folder', key: 'path', width: 44 },
    ])
    for (const r of inv.records.filter((x) => x.icgId && inv.overlapOf.get(x.icgId) === 'I1')) {
      ws.addRow({ icg: r.icgId, name: r.name, date: r.newestDate, sets: r.setsInNewest, path: r.path })
    }
  }

  if (inv.staged?.sets.length) {
    const ws = sheet(wb, 'Staged casts', [
      { header: 'Staged set', key: 'title', width: 44 },
      { header: 'Unknown today', key: 'unknown', width: 40 },
      { header: 'Known via catalogue', key: 'resolved', width: 40 },
      { header: 'Whole cast known', key: 'full', width: 16 },
      { header: 'Id', key: 'id', width: 28 },
    ])
    for (const s of inv.staged.sets) {
      ws.addRow({ title: s.title, unknown: s.unknown.join(', '), resolved: s.resolved.join(', '), full: s.resolved.length === s.unknown.length ? 'yes' : 'no', id: s.id })
    }
  }

  if (inv.archive?.matches.length) {
    const ws = sheet(wb, 'Archive names', [
      { header: 'Orphan folder', key: 'folder', width: 56 },
      { header: 'Person token', key: 'token', width: 24 },
      { header: 'Catalogue candidates', key: 'candidates', width: 40 },
      { header: 'Ambiguous', key: 'ambiguous', width: 11 },
    ])
    for (const m of inv.archive.matches) {
      ws.addRow({ folder: m.folderName, token: m.token, candidates: m.candidates.join(', '), ambiguous: m.candidates.length > 1 ? 'yes' : '' })
    }
  }

  const all = sheet(wb, 'All folders', [
    { header: 'Folder', key: 'path', width: 44 },
    { header: 'ICG-ID', key: 'icg', width: 14 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Overlap', key: 'overlap', width: 9 },
    { header: 'Problems', key: 'problems', width: 18 },
    { header: 'Versions', key: 'versions', width: 9 },
    { header: 'Sets', key: 'sets', width: 7 },
    { header: 'Aliases', key: 'aliases', width: 8 },
    { header: 'Covers', key: 'covers', width: 8 },
    { header: 'Portrait', key: 'portrait', width: 10 },
  ])
  for (const r of inv.records) {
    all.addRow({
      path: r.path,
      icg: r.icgId ?? r.fileIcgId ?? r.dirIcgId ?? '',
      name: r.name,
      status: statusOf(r),
      overlap: r.icgId ? (inv.overlapOf.get(r.icgId) ?? '') : '',
      problems: [...new Set(r.problems.map((p) => p.code))].join(' '),
      versions: r.versions,
      sets: r.setIds.length,
      aliases: r.aliases.length,
      covers: r.covers,
      portrait: r.portrait.kind,
    })
  }

  return wb
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Cache = { catalogue: string; walkedAt: string; decoder: string; records: FolderRecord[] }

async function main() {
  console.log('Catalogue inventory — READ-ONLY (nothing is written to the app)')
  console.log(`  catalogue : ${CATALOGUE}`)
  console.log(`  app       : ${OFFLINE ? 'offline' : `${BASE_URL}${TENANT ? `  [${TENANT}]` : ''}`}`)

  let cache: Cache
  if (CACHE && !REWALK && fs.existsSync(CACHE)) {
    cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Cache
    console.log(`Read ${cache.records.length.toLocaleString()} folder(s) from the cache (walked ${cache.walkedAt}).`)
  } else {
    const decoder = await loadDecoder()
    console.log(`  covers    : ~5 % sample, ${decoder.mode}`)
    const started = Date.now()
    const records = await walk(CATALOGUE, decoder)
    cache = { catalogue: CATALOGUE, walkedAt: new Date().toISOString(), decoder: decoder.mode, records }
    console.log(`Walked ${records.length.toLocaleString()} folder(s) in ${((Date.now() - started) / 60000).toFixed(1)} min`)
    if (CACHE && !LIMIT) {
      fs.writeFileSync(CACHE, JSON.stringify(cache))
      console.log(`Cached to ${CACHE} — later runs reuse it.`)
    }
  }

  let context: InventoryContext | null = null
  let worklist: InventoryWorklist | null = null
  if (!OFFLINE) {
    process.stdout.write('Fetching what the app holds… ')
    ;[context, worklist] = await Promise.all([
      getJson<InventoryContext>('/api/catalogue/inventory-context'),
      getJson<InventoryWorklist>('/api/archive/attribution-worklist'),
    ])
    console.log(`${context.persons.length.toLocaleString()} persons, ${context.contacts.length.toLocaleString()} contacts, ${worklist.orphans.length.toLocaleString()} orphan folders`)
  }

  const inv = buildInventory(cache.records, context, worklist)
  const covers = cache.records.reduce((n, r) => n + r.covers, 0)
  const sampled = cache.records.reduce((n, r) => n + r.coversSampled, 0)
  const wb = writeWorkbook(inv, { decoder: cache.decoder, walkedAt: cache.walkedAt, covers, sampled })
  await wb.xlsx.writeFile(OUT)

  console.log(`\n  folders      ${inv.folders.toLocaleString()}`)
  console.log(`  clean        ${inv.health.clean.toLocaleString()}  (${pct(inv.health.clean, inv.folders)})`)
  console.log(`  partial      ${inv.health.partial.toLocaleString()}  (${pct(inv.health.partial, inv.folders)})`)
  console.log(`  quarantined  ${inv.health.quarantined.toLocaleString()}  (${pct(inv.health.quarantined, inv.folders)})  ${inv.noGo.quarantine ? 'NO-GO' : 'ok'}`)
  if (inv.staged) console.log(`  staged cast  ${inv.staged.becomeKnown}/${inv.staged.unknownMembers} unknown members become known`)
  console.log(`\nWorkbook: ${path.resolve(OUT)}`)
}

main().catch((err) => {
  console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
