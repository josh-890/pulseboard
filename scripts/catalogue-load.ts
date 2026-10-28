#!/usr/bin/env tsx
/**
 * catalogue-load.ts — load the person catalogue into the app (ADR-0038, S3).
 *
 * Walks `<root>\<Initial>\<Name_(ICG-ID)>\_meta\` on the machine that holds the
 * catalogue and sends each folder's import files (and image names) to the app,
 * which judges and writes them with its own parser: every identity becomes a
 * Contact (never a Person), every set goes into the catalogue set table, the
 * newest file is kept for Develop, and problems land on the runs page
 * (/people/contacts/runs) — where the run can be undone.
 *
 * Only what changed is sent: the app answers the folder index with the
 * signature of every folder it holds (import file names, sizes and times plus
 * image names), and unchanged folders are skipped. `--all` sends everything.
 * The very first load needs a prod backup from the last 24 hours
 * (bash scripts/tenant-backup.sh xpulse) — the app refuses it otherwise.
 *
 * Usage:
 *   node catalogue-load.mjs                     # reads PERSON_CATALOGUE_ROOT etc. from .env
 *   node catalogue-load.mjs --dry-run           # what would be sent, nothing written
 *   node catalogue-load.mjs --limit 200         # a first look: 200 folders (nothing marked gone)
 *   node catalogue-load.mjs --all               # a full pass
 *
 * Flags:
 *   --catalogue DIR   Catalogue root (default PERSON_CATALOGUE_ROOT)
 *   --all             Send every folder, changed or not
 *   --limit N         Only the first N folders; folders not seen are NOT marked gone
 *   --batch N         Folders per request (default 25)
 *   --dry-run         Count what would be sent; open no run
 *   --base-url URL, --api-key KEY, --tenant ID   Default to the ARCHIVE_* env vars
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const getArg = (flag: string): string | null => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/** A `.env` next to the script, then one in the working directory. Existing env wins. */
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
const ALL = args.includes('--all')
const DRY = args.includes('--dry-run')
const LIMIT = Number(getArg('--limit')) || 0
const BATCH = Math.max(1, Number(getArg('--batch')) || 25)

if (!CATALOGUE) {
  console.error('Error: --catalogue (or PERSON_CATALOGUE_ROOT) is required')
  process.exit(1)
}
if (!API_KEY) {
  console.error('Error: --api-key or ARCHIVE_API_KEY is required')
  process.exit(1)
}

const IMAGE_RE = /\.(jpe?g|png|webp)$/i
const DIR_ICG_RE = /_\(([^)]+)\)$/

type ImageEntry = { name: string; size: number }
type ImportFileInput = { name: string; content: string | null; readError?: string }
type IndexEntry = { path: string; dirName: string; full: string; dirIcgId: string | null }

function listDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function statSafe(file: string): fs.Stats | null {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

function images(dir: string): ImageEntry[] {
  return listDir(dir)
    .filter((e) => e.isFile() && IMAGE_RE.test(e.name))
    .map((e) => ({ name: e.name, size: statSafe(path.join(dir, e.name))?.size ?? 0 }))
}

function index(root: string): IndexEntry[] {
  const out: IndexEntry[] = []
  for (const bucket of listDir(root).filter((e) => e.isDirectory())) {
    for (const person of listDir(path.join(root, bucket.name)).filter((e) => e.isDirectory())) {
      out.push({
        path: path.join(bucket.name, person.name),
        dirName: person.name,
        full: path.join(root, bucket.name, person.name),
        dirIcgId: person.name.match(DIR_ICG_RE)?.[1] ?? null,
      })
      if (LIMIT && out.length >= LIMIT) return out
    }
  }
  return out
}

/** What makes a folder "changed": its import files (name, size, time) and image names */
function signatureOf(entry: IndexEntry): string {
  const meta = path.join(entry.full, '_meta')
  const files = listDir(meta)
    .filter((e) => e.isFile() && !path.extname(e.name))
    .map((e) => {
      const st = statSafe(path.join(meta, e.name))
      return `${e.name}|${st?.size ?? -1}|${Math.round(st?.mtimeMs ?? 0)}`
    })
    .sort()
  const imgs = [...images(meta).map((i) => `m:${i.name}`), ...images(entry.full).map((i) => `p:${i.name}`)].sort()
  return createHash('sha1').update(JSON.stringify([files, imgs])).digest('hex')
}

function readFolder(entry: IndexEntry, signature: string) {
  const meta = path.join(entry.full, '_meta')
  const importFiles: ImportFileInput[] = listDir(meta)
    .filter((e) => e.isFile() && !path.extname(e.name))
    .map((e) => {
      try {
        return { name: e.name, content: fs.readFileSync(path.join(meta, e.name), 'utf8') }
      } catch (err) {
        return { name: e.name, content: null, readError: err instanceof Error ? err.message : String(err) }
      }
    })
  return {
    path: entry.path,
    dirName: entry.dirName,
    importFiles,
    metaImages: images(meta),
    personImages: images(entry.full),
    covers: 0,
    coverChecks: [],
    signature,
  }
}

async function call<T>(route: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-archive-key': API_KEY }
  if (TENANT) headers['x-tenant-id'] = TENANT
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(`${BASE_URL}${route}`, { method: 'POST', headers, body: JSON.stringify(body) })
      const text = await resp.text()
      if (resp.status === 409 || resp.status === 401 || resp.status === 400) {
        throw Object.assign(new Error(`${resp.status}: ${text.slice(0, 400)}`), { final: true })
      }
      if (!resp.ok) throw new Error(`${resp.status}: ${text.slice(0, 300)}`)
      return JSON.parse(text) as T
    } catch (err) {
      if (err && typeof err === 'object' && 'final' in err) throw err
      lastError = err instanceof Error ? err.message : String(err)
      await new Promise((r) => setTimeout(r, attempt * 5000))
    }
  }
  throw new Error(`${route} failed three times: ${lastError}`)
}

function makeTicker(intervalMs = 2000) {
  let last = 0
  return (line: string) => {
    const now = Date.now()
    if (now - last < intervalMs) return
    last = now
    process.stdout.write(`\r${line.padEnd(78).slice(0, 78)}`)
  }
}

type FolderResult = { path: string; outcome: string; flagged: boolean; error?: string }

async function main() {
  console.log(`Catalogue: ${CATALOGUE}`)
  console.log(`App:       ${BASE_URL}${TENANT ? ` [${TENANT}]` : ''}${DRY ? '   (dry run)' : ''}`)
  process.stdout.write('Indexing folders… ')
  const folders = index(CATALOGUE)
  console.log(`${folders.length.toLocaleString()} person folders${LIMIT ? ` (limited to ${LIMIT})` : ''}`)
  if (folders.length === 0) {
    console.error('No folders found — is the catalogue root right?')
    process.exit(1)
  }

  let runId = ''
  let known: Record<string, string> = {}
  if (!DRY) {
    const started = await call<{ runId: string; mode: string; known: Record<string, string> }>('/api/catalogue/load/runs', {
      all: ALL,
      folders: folders.map((f) => ({ path: f.path, dirIcgId: f.dirIcgId })),
    })
    runId = started.runId
    known = started.known
    console.log(`Run ${runId} — mode ${started.mode}, ${Object.keys(known).length.toLocaleString()} folders already held`)
  }

  const tick = makeTicker()
  const failed: FolderResult[] = []
  const tally: Record<string, number> = {}
  let skipped = 0
  let sent = 0
  let batch: ReturnType<typeof readFolder>[] = []
  const flush = async () => {
    if (!batch.length) return
    if (!DRY) {
      const { results } = await call<{ results: FolderResult[] }>(`/api/catalogue/load/runs/${runId}/folders`, { folders: batch })
      for (const r of results) {
        tally[r.outcome] = (tally[r.outcome] ?? 0) + 1
        if (r.flagged) tally.flagged = (tally.flagged ?? 0) + 1
        if (r.outcome === 'failed') failed.push(r)
      }
    }
    sent += batch.length
    batch = []
  }

  for (const [i, f] of folders.entries()) {
    tick(`  ${i.toLocaleString()} / ${folders.length.toLocaleString()}  sent ${sent.toLocaleString()}, unchanged ${skipped.toLocaleString()}  —  ${f.dirName}`)
    let signature: string
    try {
      signature = signatureOf(f)
    } catch {
      signature = `unreadable-${Date.now()}`
    }
    if (known[f.path] === signature) {
      skipped++
      continue
    }
    batch.push(readFolder(f, signature))
    if (batch.length >= BATCH) await flush()
  }
  await flush()
  process.stdout.write(`\r${' '.repeat(78)}\r`)

  if (DRY) {
    console.log(`Would send ${sent.toLocaleString()} folders (unchanged ones are only known once a run exists).`)
    return
  }
  const { counts } = await call<{ counts: Record<string, number> }>(`/api/catalogue/load/runs/${runId}/finish`, {
    seenPaths: LIMIT ? null : folders.map((f) => f.path),
  })
  console.log(`\n  sent         ${sent.toLocaleString()}   (unchanged, skipped: ${skipped.toLocaleString()})`)
  console.log(`  new          ${(counts.new ?? 0).toLocaleString()}`)
  console.log(`  enriched     ${(counts.enriched ?? 0).toLocaleString()}`)
  console.log(`  persons      ${(counts.persons ?? 0).toLocaleString()}   (hint only — never written)`)
  console.log(`  quarantined  ${(counts.quarantined ?? 0).toLocaleString()}`)
  console.log(`  flagged      ${(counts.flagged ?? 0).toLocaleString()}`)
  console.log(`  sets         ${(counts.setsNew ?? 0).toLocaleString()} new, ${(counts.setsUpdated ?? 0).toLocaleString()} updated`)
  console.log(`  gone         ${(counts.gone ?? 0).toLocaleString()}${LIMIT ? '   (limited run: nothing marked gone)' : ''}`)
  if (failed.length) {
    console.log(`  FAILED       ${failed.length}`)
    for (const f of failed.slice(0, 20)) console.log(`    ${f.path}: ${f.error}`)
  }
  console.log(`\nDetails, problems and Undo: ${BASE_URL}/people/contacts/runs`)
}

main().catch((err) => {
  console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
