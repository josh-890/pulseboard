#!/usr/bin/env node
/**
 * Archive Scan Script
 *
 * Fetches all known archive paths from the app, checks each one on the
 * local filesystem, and POSTs the results back to the ingest API.
 *
 * Usage (Windows):
 *   npx tsx scripts/archive-scan.ts --base-url http://10.66.20.65:3000 --api-key YOUR_KEY
 *
 * Or with env vars:
 *   set ARCHIVE_BASE_URL=http://10.66.20.65:3000
 *   set ARCHIVE_API_KEY=YOUR_KEY
 *   npx tsx scripts/archive-scan.ts
 *
 * Optional flags:
 *   --dry-run     Print what would be sent without POSTing
 *   --verbose     Print each path as it is checked
 */

import fs from 'fs'
import path from 'path'

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
}

const BASE_URL = getArg('--base-url') || process.env.ARCHIVE_BASE_URL || 'http://localhost:3000'
const API_KEY = getArg('--api-key') || process.env.ARCHIVE_API_KEY || ''
const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose')

if (!API_KEY) {
  console.error('Error: --api-key or ARCHIVE_API_KEY is required')
  process.exit(1)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ArchivePathEntry = {
  id: string
  type: 'staging' | 'set'
  path: string
  isVideo: boolean
  folderName: string
}

type ScanResult = {
  id: string
  type: 'staging' | 'set'
  path: string
  exists: boolean
  fileCount: number | null
  videoPresent: boolean | null
  error: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = ['.mp4', '.wmv', '.mkv', '.avi', '.mov']

function checkPath(entry: ArchivePathEntry): ScanResult {
  const { id, type, path: archivePath, isVideo, folderName } = entry

  const base: Omit<ScanResult, 'exists' | 'fileCount' | 'videoPresent' | 'error'> = {
    id,
    type,
    path: archivePath,
  }

  try {
    const exists = fs.existsSync(archivePath) && fs.statSync(archivePath).isDirectory()
    if (!exists) {
      return { ...base, exists: false, fileCount: null, videoPresent: null, error: null }
    }

    if (isVideo) {
      // Count files in the frames\ subfolder
      const framesDir = path.join(archivePath, 'frames')
      let frameCount = 0
      if (fs.existsSync(framesDir) && fs.statSync(framesDir).isDirectory()) {
        frameCount = fs.readdirSync(framesDir).length
      }

      // Check for the video file (any recognized extension)
      const videoPresent = VIDEO_EXTENSIONS.some((ext) =>
        fs.existsSync(path.join(archivePath, folderName + ext)),
      )

      return { ...base, exists: true, fileCount: frameCount, videoPresent, error: null }
    } else {
      // Count all files directly in the folder (non-recursive)
      const files = fs.readdirSync(archivePath).filter((f) => {
        const full = path.join(archivePath, f)
        return fs.statSync(full).isFile()
      })
      return { ...base, exists: true, fileCount: files.length, videoPresent: null, error: null }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ...base, exists: false, fileCount: null, videoPresent: null, error: message }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Archive scan — base URL: ${BASE_URL}`)
  if (DRY_RUN) console.log('(dry-run mode — no changes will be written)')

  // 1. Fetch known paths
  console.log('\nFetching known archive paths…')
  const pathsResp = await fetch(`${BASE_URL}/api/archive/paths`, {
    headers: { 'x-archive-key': API_KEY },
  })
  if (!pathsResp.ok) {
    console.error(`Failed to fetch paths: ${pathsResp.status} ${pathsResp.statusText}`)
    process.exit(1)
  }
  const entries: ArchivePathEntry[] = await pathsResp.json()
  console.log(`  Found ${entries.length} path(s) to check`)

  if (entries.length === 0) {
    console.log('Nothing to scan.')
    return
  }

  // 2. Check each path
  const results: ScanResult[] = []
  const counts = { ok: 0, changed: 0, missing: 0, incomplete: 0, error: 0 }

  for (const entry of entries) {
    const result = checkPath(entry)
    results.push(result)

    if (VERBOSE) {
      const status = !result.exists
        ? 'MISSING'
        : result.error
        ? 'ERROR'
        : result.videoPresent === false
        ? 'INCOMPLETE'
        : 'OK'
      console.log(`  [${status}] ${result.path}`)
    }

    if (result.error) counts.error++
    else if (!result.exists) counts.missing++
    else if (result.videoPresent === false) counts.incomplete++
    else counts.ok++
  }

  // 3. POST results
  if (DRY_RUN) {
    console.log('\nDry-run: would send the following results:')
    console.log(JSON.stringify(results, null, 2))
  } else {
    console.log('\nSending scan results…')
    const ingestResp = await fetch(`${BASE_URL}/api/archive/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-archive-key': API_KEY,
      },
      body: JSON.stringify(results),
    })
    if (!ingestResp.ok) {
      console.error(`Failed to ingest results: ${ingestResp.status} ${ingestResp.statusText}`)
      process.exit(1)
    }
    const ingestData = await ingestResp.json()
    console.log(`  Ingested ${ingestData.count} result(s)`)
  }

  // 4. Summary
  console.log('\n── Summary ────────────────────────────────────')
  console.log(`  OK:         ${counts.ok}`)
  if (counts.incomplete > 0) console.log(`  Incomplete: ${counts.incomplete}`)
  if (counts.missing > 0)    console.log(`  Missing:    ${counts.missing}`)
  if (counts.error > 0)      console.log(`  Errors:     ${counts.error}`)
  console.log('────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('Scan failed:', err)
  process.exit(1)
})
