#!/usr/bin/env node
/**
 * Archive HD Re-bake Agent (ADR-0017)
 *
 * Runs on the machine that holds the archive (the same place you run the scan).
 * Pulls the HD-re-bake worklist from the app, reads each Aligned image's archive
 * ORIGINAL off the local filesystem, replays the alignment at full resolution
 * (mirroring the browser canvas bake), and POSTs the result back — overwriting the
 * Aligned image in place. The multi-MB original never leaves this machine.
 *
 * Usage (Windows):
 *   npx tsx scripts/archive-rebake.ts --base-url http://10.66.20.65:3000 --api-key KEY --tenant pulse,xpulse
 *
 * Flags:
 *   --tenant a,b   Tenants to process (default: the server's default tenant)
 *   --person ID    Limit to one person's aligned images
 *   --session ID   Limit to one reference session
 *   --dry-run      Report what would be re-baked; read + check but don't POST
 *   --force        Re-bake even when the original is not higher-res than the master
 *   --verbose      Log every image
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { bakeDimensions, computeBakeMatrix, parseTemplateKeypoints } from '../src/lib/image/bake-geometry'

const args = process.argv.slice(2)
const getArg = (flag: string): string | null => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

const BASE_URL = getArg('--base-url') || process.env.ARCHIVE_BASE_URL || 'http://localhost:3000'
const API_KEY = getArg('--api-key') || process.env.ARCHIVE_API_KEY || ''
const TENANTS = (getArg('--tenant') || '').split(',').map((t) => t.trim()).filter(Boolean)
const PERSON = getArg('--person')
const SESSION = getArg('--session')
const DRY_RUN = args.includes('--dry-run')
const FORCE = args.includes('--force')
const VERBOSE = args.includes('--verbose')
const JPEG_QUALITY = 92
const ASPECT_TOL = 0.02

if (!API_KEY) {
  console.error('Error: --api-key or ARCHIVE_API_KEY is required')
  process.exit(1)
}

type Entry = {
  alignedMediaItemId: string
  fullPath: string
  filename: string
  keypoints: Record<string, { x: number; y: number }>
  template: { aspectW: number; aspectH: number; bakeLongSide: number; keypoints: unknown; minSourcePx: number | null }
  sourceHash: string | null
  sourceWidth: number
  sourceHeight: number
}

function aspectClose(a: number, b: number): boolean {
  return b > 0 && Math.abs(a - b) / b <= ASPECT_TOL
}

async function bake(origBuffer: Buffer, entry: Entry): Promise<Buffer> {
  const img = await loadImage(origBuffer)
  const kps = parseTemplateKeypoints(entry.template.keypoints)
  const { bakeW, bakeH } = bakeDimensions(entry.template.aspectW, entry.template.aspectH, entry.template.bakeLongSide)
  const m = computeBakeMatrix(kps, entry.keypoints, img.width, img.height, bakeW, bakeH)
  if (!m) throw new Error('keypoints do not cover the template')

  const canvas = createCanvas(bakeW, bakeH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, bakeW, bakeH)
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
  ctx.drawImage(img, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return canvas.toBuffer('image/jpeg', JPEG_QUALITY)
}

async function processTenant(tenant: string | null): Promise<void> {
  const headers: Record<string, string> = { 'x-archive-key': API_KEY }
  if (tenant) headers['x-tenant-id'] = tenant
  const label = tenant ?? '(default)'

  const qs = new URLSearchParams()
  if (PERSON) qs.set('personId', PERSON)
  if (SESSION) qs.set('sessionId', SESSION)
  const url = `${BASE_URL}/api/archive/rebake-worklist${qs.toString() ? `?${qs}` : ''}`

  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    console.error(`[${label}] worklist fetch failed: ${resp.status} ${await resp.text()}`)
    return
  }
  const { count, entries } = (await resp.json()) as { count: number; entries: Entry[] }
  console.log(`\n--- ${label}: ${count} eligible aligned image(s) ---`)

  const tally = { rebaked: 0, wouldRebake: 0, noGain: 0, missing: 0, mismatch: 0, failed: 0 }

  for (const e of entries) {
    const file = path.join(e.fullPath, e.filename)
    if (!fs.existsSync(file)) {
      tally.missing++
      if (VERBOSE) console.log(`  MISSING  ${file}`)
      continue
    }
    const buf = fs.readFileSync(file)

    let img
    try {
      img = await loadImage(buf)
    } catch {
      tally.mismatch++
      if (VERBOSE) console.log(`  UNREADABLE  ${file}`)
      continue
    }

    // Integrity: exact hash match, else aspect must match (guards renamed/edited files).
    const hashOk = e.sourceHash != null && crypto.createHash('sha256').update(buf).digest('hex') === e.sourceHash
    const aspectOk = aspectClose(img.width / img.height, e.sourceWidth / e.sourceHeight)
    if (!hashOk && !aspectOk) {
      tally.mismatch++
      if (VERBOSE) console.log(`  MISMATCH ${file} (${img.width}x${img.height} vs source ${e.sourceWidth}x${e.sourceHeight})`)
      continue
    }

    // Skip when the original gives no resolution win over the master.
    const gain = Math.max(img.width, img.height) > Math.max(e.sourceWidth, e.sourceHeight)
    if (!gain && !FORCE) {
      tally.noGain++
      if (VERBOSE) console.log(`  NO-GAIN  ${file} (${img.width}x${img.height})`)
      continue
    }

    if (DRY_RUN) {
      tally.wouldRebake++
      console.log(`  WOULD    ${e.alignedMediaItemId}  ←  ${file} (${img.width}x${img.height})`)
      continue
    }

    try {
      const baked = await bake(buf, e)
      const fd = new FormData()
      fd.append('file', new Blob([new Uint8Array(baked)], { type: 'image/jpeg' }), 'bake.jpg')
      const post = await fetch(`${BASE_URL}/api/archive/rebake/${e.alignedMediaItemId}`, { method: 'POST', headers, body: fd })
      if (!post.ok) throw new Error(`${post.status} ${await post.text()}`)
      tally.rebaked++
      if (VERBOSE) console.log(`  OK       ${e.alignedMediaItemId}  ←  ${file} (${img.width}x${img.height})`)
    } catch (err) {
      tally.failed++
      console.error(`  FAILED   ${e.alignedMediaItemId}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`[${label}] ${DRY_RUN ? `would re-bake ${tally.wouldRebake}` : `re-baked ${tally.rebaked}`}` +
    `, no-gain ${tally.noGain}, missing ${tally.missing}, mismatch ${tally.mismatch}, failed ${tally.failed}`)
}

async function main() {
  console.log(`Archive HD re-bake → ${BASE_URL}${DRY_RUN ? '  [dry-run]' : ''}${FORCE ? '  [force]' : ''}`)
  for (const t of TENANTS.length ? TENANTS : [null]) {
    await processTenant(t)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
