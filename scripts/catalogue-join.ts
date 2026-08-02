#!/usr/bin/env node
/**
 * Person-catalogue ↔ archive join — REPORT ONLY (ADR-0027, plan slice 0).
 *
 * Runs on the machine that holds the person catalogue. Walks the
 * `<Initial>/<Common_Name_(ICG-ID)>/_meta/{_Cover,_Videos}` tree, builds an
 * in-memory index of every set it can see, pulls the archive side from the app,
 * joins the two locally on exact date + title, and prints a report.
 *
 * It writes NOTHING — no POST, no tables, no files. The catalogue is roughly
 * 40k persons and millions of set rows; only the intersection with the archive
 * is ever interesting, and this slice exists purely to find out how big and how
 * clean that intersection is before anything is built on it.
 *
 * The report answers, in order:
 *   1. RECALL   — against folders the app already has the answer for. Without
 *                 this a hit rate is unfalsifiable.
 *   2. AMBIGUITY— how often one folder matches several catalogue sets equally
 *                 well. This is the precision risk, and the reason for a review
 *                 tier rather than blanket automation.
 *   3. COVERAGE — how many orphans get a suggestion at all, and the group-size
 *                 distribution that decides whether confirmation is tractable.
 *   4. DATA QUALITY — unusable dates, unparseable filenames, channel-naming gaps.
 *
 * This file is NOT standalone — it imports the shared, unit-tested join logic
 * from src/lib/services/catalogue-join.ts. Two ways to run it:
 *
 *   From a repo checkout (run from the repo ROOT, not from scripts/):
 *     npx tsx scripts/catalogue-join.ts --catalogue "H:\Models\thenude" ...
 *
 *   As a single copyable file, for a machine with no checkout:
 *     npm run build:agent          # produces dist-agents/catalogue-join.mjs
 *     node catalogue-join.mjs --catalogue "H:\Models\thenude" ...
 *
 * Flags:
 *   --catalogue DIR  Root of the person catalogue (required)
 *   --base-url URL   App base URL
 *   --api-key KEY    Defaults to ARCHIVE_API_KEY
 *   --tenant ID      Tenant to measure
 *   --limit N        Cap the number of orphans fetched (a quick first look)
 *   --cache FILE     Reuse the parsed catalogue instead of re-walking. Written on
 *                    the first run, read on every later one. The walk takes ~30
 *                    minutes over 39k person folders; every metric below can be
 *                    recomputed from the cache in seconds.
 *   --rewalk         Force a fresh walk even when --cache exists
 *   --examples N     How many example lines to print per section (default 8)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NO_DATE,
  buildCatalogueIndex,
  channelLooselyMatches,
  groupKey,
  aliasTokenLooksMulti,
  isAmbiguous,
  matchFolder,
  normalizeTitle,
  parseCoverFilename,
  parsePersonDir,
  titleSimilarity,
  type CatalogueSet,
} from '../src/lib/services/catalogue-join'

const args = process.argv.slice(2)
const getArg = (flag: string): string | null => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/**
 * Read a `.env` sitting next to the script, then one in the working directory —
 * the same convention (and the same tolerant parsing: leading whitespace,
 * comments, optional quotes) as the .ps1 agents' loader. Without this the .ts
 * agents demand credentials on the command line while their PowerShell siblings
 * pick them up silently, which is a difference nobody should have to discover.
 * Existing environment variables always win.
 */
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
const EXAMPLES = Number(getArg('--examples')) || 8

if (!CATALOGUE) {
  console.error('Error: --catalogue (or PERSON_CATALOGUE_ROOT) is required')
  process.exit(1)
}
if (!API_KEY) {
  console.error('Error: --api-key or ARCHIVE_API_KEY is required')
  process.exit(1)
}

type WorklistOrphan = {
  archiveKey: string
  folderName: string
  fullPath: string
  parsedDate: string | null
  parsedShortName: string | null
  parsedTitle: string | null
  aliasToken: string | null
  isVideo: boolean
}
type WorklistTruth = {
  archiveKey: string
  folderName: string
  parsedDate: string | null
  parsedShortName: string | null
  parsedTitle: string | null
  setTitle: string
  setReleaseDate: string | null
  channelName: string | null
  channelShortName: string | null
  participantIcgIds: string[]
}

// ── Catalogue walk ───────────────────────────────────────────────────────────

type WalkStats = { personDirs: number; unparsedPersonDirs: number; files: number; unparsedFiles: number }

/**
 * Progress, throttled to one line every couple of seconds.
 *
 * The walk touches >100k directories on a spinning or networked drive and can
 * run for many minutes. Printing nothing until it finishes is indistinguishable
 * from a hang — the same mistake that made an earlier agent look wedged — and
 * the current bucket also names where a genuine stall happened.
 */
function makeTicker(intervalMs = 2000) {
  let last = 0
  return (line: string, force = false) => {
    const now = Date.now()
    if (!force && now - last < intervalMs) return
    last = now
    process.stdout.write(`\r${line.padEnd(78).slice(0, 78)}`)
  }
}

function readCatalogue(root: string, stats: WalkStats, unparsedExamples: string[]): CatalogueSet[] {
  const out: CatalogueSet[] = []
  const tick = makeTicker()
  const buckets = fs.readdirSync(root)
  for (const bucket of buckets) {
    const bucketPath = path.join(root, bucket)
    let bucketStat: fs.Stats
    try {
      bucketStat = fs.statSync(bucketPath)
    } catch {
      continue
    }
    if (!bucketStat.isDirectory()) continue

    for (const personDir of fs.readdirSync(bucketPath)) {
      tick(
        `  [${bucket}]  ${stats.personDirs.toLocaleString()} persons, ` +
          `${out.length.toLocaleString()} sets  —  ${personDir}`,
      )
      const person = parsePersonDir(personDir)
      if (!person) {
        stats.unparsedPersonDirs++
        continue
      }
      stats.personDirs++

      for (const [sub, isVideo] of [['_Cover', false], ['_Videos', true]] as const) {
        const dir = path.join(bucketPath, personDir, '_meta', sub)
        if (!fs.existsSync(dir)) continue
        for (const file of fs.readdirSync(dir)) {
          stats.files++
          const parsed = parseCoverFilename(file)
          if (!parsed) {
            stats.unparsedFiles++
            // Keep a sample: 7% of a million rows is a lot to lose silently, and
            // the shape of what fails decides whether the parser needs widening.
            if (unparsedExamples.length < 25) unparsedExamples.push(file)
            continue
          }
          out.push({
            icgId: person.icgId,
            personName: person.name,
            date: parsed.date,
            channel: parsed.channel,
            externalId: parsed.externalId,
            title: parsed.title,
            isVideo,
          })
        }
      }
    }
  }
  // Clear the progress line so it does not sit above the report.
  process.stdout.write(`\r${' '.repeat(78)}\r`)
  return out
}

// ── Report ───────────────────────────────────────────────────────────────────

const pct = (n: number, of: number) => (of === 0 ? '—' : `${((100 * n) / of).toFixed(1)}%`)
const row = (label: string, n: number, of: number) =>
  console.log(`  ${label.padEnd(38)} ${String(n).padStart(7)}  ${pct(n, of).padStart(7)}`)
const heading = (s: string) => console.log(`\n${s}\n${'─'.repeat(s.length)}`)

async function main() {
  console.log(`Catalogue join — REPORT ONLY (nothing is written)`)
  console.log(`  catalogue : ${CATALOGUE}`)
  console.log(`  app       : ${BASE_URL}${TENANT ? `  [${TENANT}]` : ''}`)

  let stats: WalkStats = { personDirs: 0, unparsedPersonDirs: 0, files: 0, unparsedFiles: 0 }
  let sets: CatalogueSet[]
  let unparsedExamples: string[] = []

  const cached = CACHE && !REWALK && fs.existsSync(CACHE)
  if (cached) {
    const started = Date.now()
    const blob = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as {
      stats: WalkStats
      unparsedExamples: string[]
      sets: CatalogueSet[]
    }
    stats = blob.stats
    sets = blob.sets
    unparsedExamples = blob.unparsedExamples ?? []
    console.log(
      `\nRead ${sets.length.toLocaleString()} set row(s) from the cache in ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s  (${CACHE})`,
    )
    console.log(`Pass --rewalk to re-read the catalogue from disk.`)
  } else {
    console.log(`\nWalking the catalogue — this is the slow part (>100k directories).`)
    console.log(`Ctrl+C is safe at any point: this agent writes nothing except --cache.\n`)
    const started = Date.now()
    sets = readCatalogue(CATALOGUE, stats, unparsedExamples)
    console.log(
      `Walked ${stats.personDirs.toLocaleString()} person folder(s) and read ` +
        `${sets.length.toLocaleString()} set row(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    )
    if (CACHE) {
      fs.writeFileSync(CACHE, JSON.stringify({ stats, unparsedExamples, sets }))
      console.log(`Cached to ${CACHE} — later runs reuse it in seconds.`)
    } else {
      console.log(`Tip: pass --cache catalogue.json to skip this walk next time.`)
    }
  }

  const headers: Record<string, string> = { 'x-archive-key': API_KEY }
  if (TENANT) headers['x-tenant-id'] = TENANT
  const url = `${BASE_URL}/api/archive/attribution-worklist${LIMIT ? `?limit=${LIMIT}` : ''}`
  process.stdout.write(`Fetching the archive worklist from the app… `)
  const fetchStarted = Date.now()
  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    console.error(`worklist fetch failed: ${resp.status} ${await resp.text()}`)
    process.exit(1)
  }
  const { orphans, groundTruth, channels } = (await resp.json()) as {
    orphans: WorklistOrphan[]
    groundTruth: WorklistTruth[]
    channels: { name: string; shortName: string | null; labelName: string | null }[]
  }
  console.log(
    `${orphans.length.toLocaleString()} orphan(s), ${groundTruth.length.toLocaleString()} ` +
      `ground-truth folder(s) in ${((Date.now() - fetchStarted) / 1000).toFixed(1)}s`,
  )
  process.stdout.write(`Joining… `)
  const joinStarted = Date.now()

  console.log(`done in ${((Date.now() - joinStarted) / 1000).toFixed(1)}s`)

  // ── 0. Catalogue shape ─────────────────────────────────────────────────────
  heading('0. CATALOGUE')
  const noDate = sets.filter((s) => s.date === NO_DATE).length
  console.log(`  persons                                ${String(stats.personDirs).padStart(7)}`)
  console.log(`  set rows read                          ${String(sets.length).padStart(7)}`)
  row('unusable date (0000-00-00)', noDate, sets.length)
  row('filenames that did not parse', stats.unparsedFiles, stats.files)
  if (unparsedExamples.length) {
    console.log(`  examples of filenames that did not parse:`)
    unparsedExamples.slice(0, EXAMPLES).forEach((f) => console.log(`     ${f}`))
  }
  if (stats.unparsedPersonDirs) {
    console.log(`  person dirs that did not parse         ${String(stats.unparsedPersonDirs).padStart(7)}`)
  }

  const index = buildCatalogueIndex(sets)
  console.log(`  usable for the join (dated)            ${String(sets.length - noDate).padStart(7)}`)

  // ── 1. Recall against known-good pairs ─────────────────────────────────────
  heading('1. RECALL — against folders the app already has the answer for')
  const recall = { exact: 0, strong: 0, weak: 0, missNoCatalogueRow: 0, missWrongTitle: 0, noDate: 0 }
  const recallMisses: string[] = []
  for (const gt of groundTruth) {
    if (!gt.parsedDate) {
      recall.noDate++
      continue
    }
    // Restrict to the participants the app knows — that is what makes this
    // ground truth rather than another unverified hit rate.
    const owned = (index.get(gt.parsedDate) ?? []).filter((c) =>
      gt.participantIcgIds.includes(c.icgId),
    )
    if (owned.length === 0) {
      recall.missNoCatalogueRow++
      if (recallMisses.length < EXAMPLES) {
        recallMisses.push(`     ${gt.parsedDate}  ${gt.parsedShortName ?? '?'}  "${gt.setTitle}" — catalogue has no row for this person+date`)
      }
      continue
    }
    const folderTitle = normalizeTitle(gt.parsedTitle ?? gt.setTitle)
    const best = Math.max(...owned.map((c) => titleSimilarity(folderTitle, normalizeTitle(c.title))))
    if (best >= 0.999) recall.exact++
    else if (best >= 0.75) recall.strong++
    else if (best >= 0.5) recall.weak++
    else {
      recall.missWrongTitle++
      if (recallMisses.length < EXAMPLES) {
        recallMisses.push(`     ${gt.parsedDate}  "${gt.setTitle}"  best=${best.toFixed(2)} — row exists, titles disagree`)
      }
    }
  }
  const gtUsable = groundTruth.length - recall.noDate
  row('exact date + exact title', recall.exact, gtUsable)
  row('exact date + strong title (>=.75)', recall.strong, gtUsable)
  row('exact date + weak title (>=.50)', recall.weak, gtUsable)
  row('MISS — catalogue lacks the row', recall.missNoCatalogueRow, gtUsable)
  row('MISS — row exists, titles disagree', recall.missWrongTitle, gtUsable)
  console.log(`  (ground-truth folders without a date: ${recall.noDate})`)
  console.log(`\n  The distinction matters: "catalogue lacks the row" is a COVERAGE limit`)
  console.log(`  (nothing to match), "titles disagree" is a MATCHING failure.`)
  if (recallMisses.length) {
    console.log(`\n  examples:`)
    recallMisses.forEach((m) => console.log(m))
  }

  // ── 2. Coverage + ambiguity over the orphans ───────────────────────────────
  heading('2. ORPHANS — coverage and ambiguity')
  const tally = { exact: 0, strong: 0, weak: 0, none: 0, multiParticipant: 0, ambiguous: 0 }
  const suggestedPersons = new Set<string>()
  const groups = new Map<string, { folders: number; votes: Map<string, number> }>()
  const ambiguityExamples: string[] = []

  for (const o of orphans) {
    const g = groupKey(o.parsedShortName, o.aliasToken)
    const entry = groups.get(g) ?? { folders: 0, votes: new Map<string, number>() }
    entry.folders++
    groups.set(g, entry)

    const m = matchFolder(o, index)
    if (m.tier === 'none') {
      tally.none++
      continue
    }
    tally[m.tier]++
    if (isAmbiguous(m)) {
      if (aliasTokenLooksMulti(o.aliasToken)) {
        tally.multiParticipant++
      } else {
        tally.ambiguous++
        if (ambiguityExamples.length < EXAMPLES) {
          // List DISTINCT persons — showing the first N candidates prints the
          // same person repeatedly and makes a clean match look conflicted.
          const seen = new Map<string, string>()
          for (const c of m.candidates) if (!seen.has(c.icgId)) seen.set(c.icgId, `${c.personName} (${c.icgId})`)
          ambiguityExamples.push(
            `     ${o.folderName}\n        alias "${o.aliasToken ?? '?'}"  ->  ` +
              [...seen.values()].join('  |  '),
          )
        }
      }
    }
    if (m.best) {
      suggestedPersons.add(m.best.icgId)
      entry.votes.set(m.best.icgId, (entry.votes.get(m.best.icgId) ?? 0) + 1)
    }
  }

  row('exact', tally.exact, orphans.length)
  row('strong (>=.75)', tally.strong, orphans.length)
  row('weak (>=.50)', tally.weak, orphans.length)
  row('no suggestion', tally.none, orphans.length)
  const suggested = tally.exact + tally.strong + tally.weak
  console.log(`  ${'—'.repeat(38)}`)
  row('ANY suggestion', suggested, orphans.length)
  row('  of those, multi-participant folder', tally.multiParticipant, suggested)
  row('  of those, UNEXPLAINED ambiguity', tally.ambiguous, suggested)
  console.log(`\n  A folder named "A & B" matching two people is the design working, not a`)
  console.log(`  doubt to resolve — only the unexplained row is a precision risk.`)
  console.log(`  distinct persons suggested             ${String(suggestedPersons.size).padStart(7)}`)
  if (ambiguityExamples.length) {
    console.log(`\n  ambiguity examples:`)
    ambiguityExamples.forEach((m) => console.log(m))
  }

  // ── 3. Groups — is confirmation tractable? ─────────────────────────────────
  heading('3. GROUPS — the confirmation unit (channel, alias)')
  const sorted = [...groups.entries()].sort((a, b) => b[1].folders - a[1].folders)
  const totalGrouped = sorted.reduce((s, [, g]) => s + g.folders, 0)
  console.log(`  distinct groups                        ${String(sorted.length).padStart(7)}`)
  const cum = (n: number) => sorted.slice(0, n).reduce((s, [, g]) => s + g.folders, 0)
  for (const n of [100, 500, 1000, 2000]) {
    if (n > sorted.length) break
    row(`top ${n} groups cover`, cum(n), totalGrouped)
  }
  const singles = sorted.filter(([, g]) => g.folders === 1).length
  row('groups with a single folder', singles, sorted.length)

  let unanimous = 0
  let split = 0
  let silent = 0
  for (const [, g] of sorted) {
    if (g.votes.size === 0) silent++
    else if (g.votes.size === 1) unanimous++
    else split++
  }
  console.log()
  row('groups with a unanimous suggestion', unanimous, sorted.length)
  row('groups with conflicting suggestions', split, sorted.length)
  row('groups with no suggestion at all', silent, sorted.length)
  console.log(`\n  A split group is not noise — it marks folders where more than one`)
  console.log(`  person is genuinely involved, or where the alias is reused.`)

  // ── 4. Channel naming ──────────────────────────────────────────────────────
  heading('4. CHANNEL — corroboration, and a false-positive probe')
  // A catalogue channel and an app channel that disagree are not all the same
  // thing. Two channels of the SAME owning label (ADR-0020) genuinely share sets;
  // a disagreement ACROSS labels means the join almost certainly landed on a
  // different set that happens to share a date and a title. The second kind is a
  // precision problem and is counted separately.
  const labelOfChannel = (candidate: string): string | null => {
    for (const c of channels) {
      if (c.shortName && channelLooselyMatches(candidate, c.shortName)) return c.labelName
      if (channelLooselyMatches(candidate, c.name)) return c.labelName
    }
    return null
  }

  let agree = 0
  let sameLabel = 0
  let crossLabel = 0
  let unknownLabel = 0
  const crossExamples = new Set<string>()
  for (const gt of groundTruth) {
    const short = gt.channelShortName ?? gt.parsedShortName
    if (!short || !gt.parsedDate) continue
    const owned = (index.get(gt.parsedDate) ?? []).filter((c) => gt.participantIcgIds.includes(c.icgId))
    for (const c of owned) {
      if (channelLooselyMatches(c.channel, short)) {
        agree++
        continue
      }
      const catLabel = labelOfChannel(c.channel)
      const appLabel = channels.find((x) => x.shortName === short || x.name === gt.channelName)?.labelName ?? null
      if (catLabel && appLabel && catLabel === appLabel) {
        sameLabel++
      } else if (catLabel && appLabel) {
        crossLabel++
        if (crossExamples.size < EXAMPLES) {
          crossExamples.add(
            `     "${c.channel}" [${catLabel}]  vs app "${gt.channelName ?? '?'}" [${appLabel}]  —  ${gt.parsedDate} "${gt.setTitle}"`,
          )
        }
      } else {
        unknownLabel++
      }
    }
  }
  const totalChan = agree + sameLabel + crossLabel + unknownLabel
  row('channel agrees', agree, totalChan)
  row('differs, SAME label (expected)', sameLabel, totalChan)
  row('differs, CROSS label (suspicious)', crossLabel, totalChan)
  row('differs, label unknown', unknownLabel, totalChan)
  if (crossExamples.size) {
    console.log(`\n  cross-label matches — check these, they are the likeliest false positives:`)
    crossExamples.forEach((m) => console.log(m))
  }

  heading('VERDICT INPUTS')
  console.log(`  Compare against the 6-person probe that produced ADR-0027:`)
  console.log(`    exact recall 91.3%, join-key ambiguity 0.29%, catalogue channel coverage 98%.`)
  console.log(`  Use the UNEXPLAINED ambiguity row, not the raw one: multi-participant`)
  console.log(`  folders legitimately match several people and are not a decision.`)
  console.log(`  If unexplained ambiguity is far above ~1% or exact recall far below`)
  console.log(`  ~80%, ADR-0027 needs revisiting before slices 4-6 are built.`)
  console.log()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
