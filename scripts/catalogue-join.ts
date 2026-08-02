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
 * Usage (Windows):
 *   npx tsx scripts/catalogue-join.ts --catalogue "D:\Persons" --base-url http://10.66.20.65:3000 --tenant xpulse
 *
 * Flags:
 *   --catalogue DIR  Root of the person catalogue (required)
 *   --base-url URL   App base URL
 *   --api-key KEY    Defaults to ARCHIVE_API_KEY
 *   --tenant ID      Tenant to measure
 *   --limit N        Cap the number of orphans fetched (a quick first look)
 *   --examples N     How many example lines to print per section (default 8)
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  NO_DATE,
  buildCatalogueIndex,
  channelLooselyMatches,
  groupKey,
  distinctPersons,
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

const CATALOGUE = getArg('--catalogue') || process.env.PERSON_CATALOGUE_ROOT || ''
const BASE_URL = (getArg('--base-url') || process.env.ARCHIVE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const API_KEY = getArg('--api-key') || process.env.ARCHIVE_API_KEY || ''
const TENANT = getArg('--tenant') || process.env.ARCHIVE_TENANT || ''
const LIMIT = Number(getArg('--limit')) || 0
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

function readCatalogue(root: string, stats: WalkStats): CatalogueSet[] {
  const out: CatalogueSet[] = []
  for (const bucket of fs.readdirSync(root)) {
    const bucketPath = path.join(root, bucket)
    let bucketStat: fs.Stats
    try {
      bucketStat = fs.statSync(bucketPath)
    } catch {
      continue
    }
    if (!bucketStat.isDirectory()) continue

    for (const personDir of fs.readdirSync(bucketPath)) {
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

  const stats: WalkStats = { personDirs: 0, unparsedPersonDirs: 0, files: 0, unparsedFiles: 0 }
  const started = Date.now()
  const sets = readCatalogue(CATALOGUE, stats)
  console.log(`\nWalked the catalogue in ${((Date.now() - started) / 1000).toFixed(1)}s`)

  const headers: Record<string, string> = { 'x-archive-key': API_KEY }
  if (TENANT) headers['x-tenant-id'] = TENANT
  const url = `${BASE_URL}/api/archive/attribution-worklist${LIMIT ? `?limit=${LIMIT}` : ''}`
  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    console.error(`worklist fetch failed: ${resp.status} ${await resp.text()}`)
    process.exit(1)
  }
  const { orphans, groundTruth } = (await resp.json()) as {
    orphans: WorklistOrphan[]
    groundTruth: WorklistTruth[]
  }

  // ── 0. Catalogue shape ─────────────────────────────────────────────────────
  heading('0. CATALOGUE')
  const noDate = sets.filter((s) => s.date === NO_DATE).length
  console.log(`  persons                                ${String(stats.personDirs).padStart(7)}`)
  console.log(`  set rows read                          ${String(sets.length).padStart(7)}`)
  row('unusable date (0000-00-00)', noDate, sets.length)
  row('filenames that did not parse', stats.unparsedFiles, stats.files)
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
  const tally = { exact: 0, strong: 0, weak: 0, none: 0, ambiguous: 0 }
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
      tally.ambiguous++
      if (ambiguityExamples.length < EXAMPLES) {
        ambiguityExamples.push(
          `     ${o.folderName}  ->  ${distinctPersons(m)} persons: ` +
            m.candidates.slice(0, 3).map((c) => `${c.personName} (${c.icgId}) / ${c.channel}`).join('  |  '),
        )
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
  row('  of those, AMBIGUOUS (>1 person)', tally.ambiguous, suggested)
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
  heading('4. CHANNEL NAMING — corroboration quality')
  let agree = 0
  let differ = 0
  const differExamples = new Set<string>()
  for (const gt of groundTruth) {
    const short = gt.channelShortName ?? gt.parsedShortName
    if (!short || !gt.parsedDate) continue
    const owned = (index.get(gt.parsedDate) ?? []).filter((c) => gt.participantIcgIds.includes(c.icgId))
    for (const c of owned) {
      if (channelLooselyMatches(c.channel, short)) agree++
      else {
        differ++
        if (differExamples.size < EXAMPLES) {
          differExamples.add(`     catalogue "${c.channel}"  vs app "${gt.channelName ?? '?'}" (${short})`)
        }
      }
    }
  }
  row('channel agrees', agree, agree + differ)
  row('channel differs', differ, agree + differ)
  if (differExamples.size) {
    console.log(`\n  examples (mostly spelling, some genuine cross-publication):`)
    differExamples.forEach((m) => console.log(m))
  }

  heading('VERDICT INPUTS')
  console.log(`  Compare against the 6-person probe that produced ADR-0027:`)
  console.log(`    exact recall 91.3%, join-key ambiguity 0.29%, catalogue channel coverage 98%.`)
  console.log(`  If ambiguity here is far above ~1% or recall far below ~90%, the`)
  console.log(`  design in ADR-0027 needs revisiting before slices 4-6 are built.`)
  console.log()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
