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
import { parseFilename, parseImportFile } from '../src/lib/services/import/parser'
import {
  NO_DATE,
  buildCatalogueIndex,
  channelLooselyMatches,
  groupKey,
  aliasTokenLooksMulti,
  distinctPersons,
  isAmbiguous,
  matchFolder,
  participantMatchingAlias,
  plausibleDateVariants,
  suggestedParticipants,
  normalizeTitle,
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

type WalkStats = {
  personDirs: number
  unparsedPersonDirs: number
  personsWithoutImportFile: number
  importFiles: number
  setsWithoutDate: number
}

/**
 * Progress, throttled to one line every couple of seconds.
 *
 * The walk reads one multi-hundred-KB import file per person across ~39k
 * folders and can run for many minutes. Printing nothing until it finishes is
 * indistinguishable from a hang, and the current folder also names where a
 * genuine stall happened.
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

/**
 * The newest import file in a person's `_meta` folder.
 *
 * Files are named `YYYY-MM-DD_Name_(ICG-ID)` with the SCAN date, so several may
 * exist; the newest wins. Only the extension-less ones are import files —
 * `_Bios.txt`, `_Cowork_*.csv` and the avatar `.jpg` share the folder.
 */
function newestImportFile(metaDir: string): string | null {
  let best: { date: string; file: string } | null = null
  let entries: string[]
  try {
    entries = fs.readdirSync(metaDir)
  } catch {
    return null
  }
  for (const entry of entries) {
    if (path.extname(entry)) continue
    const meta = parseFilename(entry)
    if (!meta.extractionDate || !meta.icgId) continue
    if (!best || meta.extractionDate > best.date) best = { date: meta.extractionDate, file: entry }
  }
  return best ? path.join(metaDir, best.file) : null
}

function readCatalogue(root: string, stats: WalkStats, problems: string[]): CatalogueSet[] {
  const out: CatalogueSet[] = []
  const tick = makeTicker()
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
      tick(
        `  [${bucket}]  ${stats.personDirs.toLocaleString()} persons, ` +
          `${out.length.toLocaleString()} sets  —  ${personDir}`,
      )

      const file = newestImportFile(path.join(bucketPath, personDir, '_meta'))
      if (!file) {
        stats.personsWithoutImportFile++
        if (problems.length < 25) problems.push(`no import file: ${personDir}`)
        continue
      }

      let parsed
      try {
        parsed = parseImportFile(fs.readFileSync(file, 'utf8'))
      } catch (err) {
        // One unreadable file must cost one person, not the run.
        if (problems.length < 25) {
          problems.push(`unreadable: ${personDir} — ${err instanceof Error ? err.message : err}`)
        }
        continue
      }
      stats.importFiles++

      for (const set of parsed.sets) {
        const date = set.date && /^\d{4}-\d{2}-\d{2}$/.test(set.date) ? set.date : NO_DATE
        if (date === NO_DATE) stats.setsWithoutDate++
        // ModelsList is the authority on the cast; fall back to the folder owner
        // when a set lists nobody at all.
        const participants = set.modelsList.map((m) => m.icgId).filter(Boolean)
        out.push({
          icgId: person.icgId,
          personName: person.name,
          participantIcgIds: participants.length ? [...new Set(participants)] : [person.icgId],
          date,
          channel: set.channelName,
          externalId: set.externalId,
          title: set.title,
          isVideo: set.isVideo,
        })
      }
    }
  }
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

  let stats: WalkStats = {
    personDirs: 0,
    unparsedPersonDirs: 0,
    personsWithoutImportFile: 0,
    importFiles: 0,
    setsWithoutDate: 0,
  }
  let sets: CatalogueSet[]
  let problems: string[] = []

  const cached = CACHE && !REWALK && fs.existsSync(CACHE)
  if (cached) {
    const started = Date.now()
    const blob = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as {
      stats: WalkStats
      problems: string[]
      sets: CatalogueSet[]
    }
    stats = blob.stats
    sets = blob.sets
    problems = blob.problems ?? []
    console.log(
      `\nRead ${sets.length.toLocaleString()} set row(s) from the cache in ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s  (${CACHE})`,
    )
    console.log(`Pass --rewalk to re-read the catalogue from disk.`)
  } else {
    console.log(`\nWalking the catalogue — this is the slow part (>100k directories).`)
    console.log(`Ctrl+C is safe at any point: this agent writes nothing except --cache.\n`)
    const started = Date.now()
    sets = readCatalogue(CATALOGUE, stats, problems)
    process.stdout.write('\n')
    console.log(
      `Walked ${stats.personDirs.toLocaleString()} person folder(s) and read ` +
        `${sets.length.toLocaleString()} set row(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    )
    if (CACHE) {
      fs.writeFileSync(CACHE, JSON.stringify({ stats, problems, sets }))
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

  // Resolve a catalogue channel name to the app's owning label. Order matters:
  // the loose subsequence rule that is fine as a TIEBREAKER is far too eager
  // here — almost any short code is a subsequence of a long name like
  // "EROTICBEAUTY", so taking the first loose hit attributed it to whichever
  // channel happened to sort first. Exact name match first, then short code,
  // and only then the loose rule.
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
  const byName = new Map(channels.map((c) => [norm(c.name), c]))
  const byShort = new Map(channels.filter((c) => c.shortName).map((c) => [norm(c.shortName!), c]))
  const labelOfChannel = (candidate: string): string | null => {
    const key = norm(candidate)
    const exact = byName.get(key) ?? byShort.get(key)
    if (exact) return exact.labelName
    const loose = channels.filter(
      (c) => channelLooselyMatches(candidate, c.name) || (c.shortName && channelLooselyMatches(candidate, c.shortName)),
    )
    // Only trust the loose rule when it is unambiguous.
    return loose.length === 1 ? loose[0].labelName : null
  }

  const joinStarted = Date.now()

  console.log(`done in ${((Date.now() - joinStarted) / 1000).toFixed(1)}s`)

  // ── 0. Catalogue shape ─────────────────────────────────────────────────────
  heading('0. CATALOGUE')
  const noDate = sets.filter((s) => s.date === NO_DATE).length
  console.log(`  person folders                         ${String(stats.personDirs).padStart(7)}`)
  console.log(`  import files parsed                    ${String(stats.importFiles).padStart(7)}`)
  console.log(`  set rows read                          ${String(sets.length).padStart(7)}`)
  row('unusable date (0000-00-00)', noDate, sets.length)
  if (stats.personsWithoutImportFile) {
    row('persons with NO import file', stats.personsWithoutImportFile, stats.personDirs)
  }
  if (stats.unparsedPersonDirs) {
    console.log(`  folders that are not a person          ${String(stats.unparsedPersonDirs).padStart(7)}`)
  }
  const multi = sets.filter((s) => s.participantIcgIds.length > 1).length
  row('sets naming >1 participant', multi, sets.length)
  if (problems.length) {
    console.log(`  problems:`)
    problems.slice(0, EXAMPLES).forEach((f) => console.log(`     ${f}`))
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
    // Match on the whole cast, not the file's owner: ModelsList means a set is
    // reachable through any of its participants, which is the point of reading
    // the import file instead of cover filenames.
    const owned = (index.get(gt.parsedDate) ?? []).filter((c) =>
      c.participantIcgIds.some((p) => gt.participantIcgIds.includes(p)),
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

  // ── 1b. PRECISION — the same join, run blind ───────────────────────────────
  heading('1b. PRECISION — how often an unprompted suggestion is simply WRONG')
  console.log(`  Section 1 restricts candidates to the participants the app already`)
  console.log(`  knows, so it cannot produce a wrong answer — it measures "can we find`)
  console.log(`  the right one when we look for it". On an orphan there is no such`)
  console.log(`  restriction: the join runs blind against every catalogue row.`)
  console.log(`  Here the SAME ground-truth folders are matched blind, then checked.\n`)
  console.log(`  Read this asymmetrically. These folders were curated BY HAND, so they`)
  console.log(`  are the clean, easy end of the population: a result near 100% is only`)
  console.log(`  mildly reassuring and does NOT generalise to the 29k orphans. A result`)
  console.log(`  below 100% is damning — it means the join errs even on the tidiest`)
  console.log(`  data available. The test can falsify the design; it cannot bless it.\n`)

  const prec = { checked: 0, right: 0, wrong: 0, noMatch: 0, wrongCrossLabel: 0 }
  const wrongExamples: string[] = []
  for (const gt of groundTruth) {
    if (!gt.parsedDate || gt.participantIcgIds.length === 0) continue
    const blind = matchFolder(
      {
        archiveKey: gt.archiveKey,
        folderName: gt.folderName,
        parsedDate: gt.parsedDate,
        parsedShortName: gt.parsedShortName,
        parsedTitle: gt.parsedTitle,
      },
      index,
    )
    if (blind.tier !== 'exact') {
      if (blind.tier === 'none') prec.noMatch++
      continue
    }
    prec.checked++
    // Right = the winning rows name at least one participant the app records
    // for this set. Anything else is a suggestion that would have been wrong.
    const named = suggestedParticipants(blind)
    if (named.some((p) => gt.participantIcgIds.includes(p))) {
      prec.right++
      continue
    }
    prec.wrong++
    const catLabel = blind.best ? labelOfChannel(blind.best.channel) : null
    const appLabel = gt.channelName ? (byName.get(norm(gt.channelName))?.labelName ?? null) : null
    if (catLabel && appLabel && catLabel !== appLabel) prec.wrongCrossLabel++
    if (wrongExamples.length < EXAMPLES) {
      wrongExamples.push(
        `     ${gt.folderName}\n        app says: ${gt.participantIcgIds.join(', ')}` +
          `\n        join says: ${named.join(', ')}  via "${blind.best?.channel ?? '?'}" "${blind.best?.title ?? ''}"`,
      )
    }
  }
  row('exact matches produced blind', prec.checked, prec.checked + prec.noMatch)
  row('  RIGHT (names a known participant)', prec.right, prec.checked)
  row('  WRONG', prec.wrong, prec.checked)
  row('    of the wrong ones, cross-label', prec.wrongCrossLabel, prec.wrong)
  if (wrongExamples.length) {
    console.log(`\n  wrong suggestions:`)
    wrongExamples.forEach((m) => console.log(m))
  }
  console.log(`\n  This is the figure an operator experiences. A wrong suggestion that is`)
  console.log(`  confirmed puts a person into a career they were never part of.`)

  // ── 2. Coverage + ambiguity over the orphans ───────────────────────────────
  heading('2. ORPHANS — coverage and ambiguity')
  // ICG-ID -> person name, from the catalogue's own folder names.
  const nameOfIcgId = new Map<string, string>()
  for (const set of sets) if (!nameOfIcgId.has(set.icgId)) nameOfIcgId.set(set.icgId, set.personName)
  const lookupName = (icgId: string) => nameOfIcgId.get(icgId)

  const tally = {
    exact: 0, strong: 0, weak: 0, none: 0,
    multiParticipant: 0, ambiguous: 0, aliasResolved: 0,
    exactCrossLabel: 0,
  }
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
    const aliasPick = participantMatchingAlias(m, o.aliasToken, lookupName)

    // Would a cross-label channel demote this out of the auto-suggest tier?
    // Counted only on exact matches, since those are the ones a rule would
    // otherwise wave through without review.
    if (m.tier === 'exact' && m.best && o.parsedShortName) {
      if (!channelLooselyMatches(m.best.channel, o.parsedShortName)) {
        const catLabel = labelOfChannel(m.best.channel)
        const appLabel = byShort.get(norm(o.parsedShortName))?.labelName ?? null
        if (catLabel && appLabel && catLabel !== appLabel) tally.exactCrossLabel++
      }
    }

    if (isAmbiguous(m)) {
      if (aliasTokenLooksMulti(o.aliasToken)) {
        tally.multiParticipant++
      } else if (aliasPick) {
        // The folder names one of the candidates outright — resolved, not doubtful.
        tally.aliasResolved++
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
    // The SET suggests everyone in it; the GROUP's vote is only about who the
    // alias is. Voting for every participant made every multi-person set look
    // like a disagreement about the alias, which it is not.
    for (const p of suggestedParticipants(m)) suggestedPersons.add(p)
    // Vote only when the answer is not a guess: the alias named someone, or the
    // winning rows name exactly ONE participant between them. Taking
    // participantIcgIds[0] as a fallback (as this did) picks arbitrarily out of a
    // two-person set — a coin flip dressed as a suggestion.
    const all = suggestedParticipants(m)
    const votesFor = aliasPick ?? (all.length === 1 ? all[0] : null)
    if (votesFor) entry.votes.set(votesFor, (entry.votes.get(votesFor) ?? 0) + 1)
  }

  row('exact', tally.exact, orphans.length)
  row('strong (>=.75)', tally.strong, orphans.length)
  row('weak (>=.50)', tally.weak, orphans.length)
  row('no suggestion', tally.none, orphans.length)
  const suggested = tally.exact + tally.strong + tally.weak
  console.log(`  ${'—'.repeat(38)}`)
  row('ANY suggestion', suggested, orphans.length)
  row('  of those, multi-participant folder', tally.multiParticipant, suggested)
  row('  of those, resolved by the alias', tally.aliasResolved, suggested)
  row('  of those, UNEXPLAINED ambiguity', tally.ambiguous, suggested)
  row('  exact matches on a CROSS-LABEL channel', tally.exactCrossLabel, tally.exact)
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
  let agree = 0
  let sameLabel = 0
  let crossLabel = 0
  let unknownLabel = 0
  const crossExamples = new Set<string>()
  for (const gt of groundTruth) {
    const short = gt.channelShortName ?? gt.parsedShortName
    if (!short || !gt.parsedDate) continue
    const owned = (index.get(gt.parsedDate) ?? []).filter((c) =>
      c.participantIcgIds.some((p) => gt.participantIcgIds.includes(p)),
    )
    for (const c of owned) {
      if (channelLooselyMatches(c.channel, short)) {
        agree++
        continue
      }
      const catLabel = labelOfChannel(c.channel)
      const appLabel =
        (gt.channelName ? byName.get(norm(gt.channelName))?.labelName : undefined) ??
        byShort.get(norm(short))?.labelName ??
        null
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

  // ── 5. Date tolerance — what a relaxed key would buy, and cost ─────────────
  heading('5. DATE TOLERANCE — archive dates are typed by hand')
  console.log(`  The archive's folder dates are set manually and drift: off by a day, or`)
  console.log(`  with the day digits transposed. Exact date is currently required, so`)
  console.log(`  those folders match nothing. This measures the trade WITHOUT taking it.\n`)

  const probe = { rescued: 0, rescuedUnique: 0, rescuedAmbiguous: 0 }
  const rescuedExamples: string[] = []
  const byOffset = new Map<string, number>()
  for (const o of orphans) {
    if (matchFolder(o, index).tier !== 'none') continue
    if (!o.parsedDate) continue
    for (const variant of plausibleDateVariants(o.parsedDate)) {
      // Only an EXACT title counts here: a relaxed date plus a fuzzy title is
      // two weakened constraints at once, which is how false positives are made.
      const alt = matchFolder({ ...o, parsedDate: variant }, index)
      if (alt.tier !== 'exact') continue
      probe.rescued++
      const persons = distinctPersons(alt)
      if (persons === 1) probe.rescuedUnique++
      else probe.rescuedAmbiguous++
      const days = Math.round(
        (Date.parse(`${variant}T00:00:00Z`) - Date.parse(`${o.parsedDate}T00:00:00Z`)) / 86_400_000,
      )
      const kind = Math.abs(days) <= 3 ? `${days > 0 ? '+' : ''}${days} day(s)` : 'transposed digits'
      byOffset.set(kind, (byOffset.get(kind) ?? 0) + 1)
      if (rescuedExamples.length < EXAMPLES) {
        rescuedExamples.push(
          `     ${o.folderName}\n        archive ${o.parsedDate} -> catalogue ${variant} (${kind}) ` +
            `"${alt.best?.title ?? ''}"`,
        )
      }
      break // first plausible variant wins; they are ordered nearest-first
    }
  }
  row('currently unmatched folders', tally.none, orphans.length)
  row('  rescued by a plausible date', probe.rescued, tally.none)
  row('    of those, unambiguous', probe.rescuedUnique, probe.rescued)
  row('    of those, several persons', probe.rescuedAmbiguous, probe.rescued)
  if (byOffset.size) {
    console.log(`\n  by kind of slip:`)
    for (const [k, n] of [...byOffset.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${String(n).padStart(6)}  ${k}`)
    }
  }
  if (rescuedExamples.length) {
    console.log(`\n  examples:`)
    rescuedExamples.forEach((m) => console.log(m))
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
