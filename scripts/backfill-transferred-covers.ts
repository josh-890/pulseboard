/**
 * Give the covers that promotion carried into a Set the hashes they never got.
 *
 * `transferStagingCoverToSet` created a MediaItem without `hash` or `phash`, so
 * these images are invisible to `/media/similar`, which only loads candidates
 * whose perceptual hash is non-null. That matters most for a set born in the
 * archive: the cover is a thumbnail of one of the folder's own images, and the
 * full-size original arrives in the same gallery on the next upload.
 *
 * What this does NOT do — and the reason is worth keeping:
 *
 *   The first version of this script also handed the cover over to the set's own
 *   first image, on the assumption that a transferred cover is a small duplicate.
 *   It is not. On xpulse all 435 of them came from the import (`staging/…`, up to
 *   1200 px), not from the archive (`archive/…`, 512 px): the publisher's cover
 *   art, a different photograph from anything in the set — the closest set image
 *   is 14–19 bits away in dHash. Replacing those would have thrown away exactly
 *   the picture the transfer exists to preserve. Going forward the transfer marks
 *   only archive-derived covers as provisional (`isProvisionalCoverKey`), and
 *   there are none of those in production yet, so nothing here needs marking.
 *
 * `hash` stays null on purpose: sha256 means "the bytes you handed me", and those
 * bytes are gone — only the re-encoded master survives. The perceptual hash is
 * computed from that master, which is sound: dHash is a grayscale downscale, so
 * the re-encode does not move it.
 *
 * The stand-in MediaItem is left in place. Deleting media is not a repair
 * script's decision; after this run it is at least findable.
 *
 * Dry-run by default; idempotent.
 *
 *     npx tsx scripts/backfill-transferred-covers.ts                  # dev, dry run
 *     npx tsx scripts/backfill-transferred-covers.ts --prod           # prod, dry run
 *     npx tsx scripts/backfill-transferred-covers.ts --prod --apply   # write
 */

import dotenv from 'dotenv'
import { GetObjectCommand } from '@aws-sdk/client-s3'

const prod = process.argv.includes('--prod')
const apply = process.argv.includes('--apply')
dotenv.config({ path: prod ? '.env.production' : '.env' })

// Loaded after `dotenv.config`, not by a static import: `src/lib/minio.ts` builds
// its S3 client at module scope, so importing it first would bake in an endpoint
// of `http://undefined:undefined`.
let prisma: (typeof import('../src/lib/db'))['prisma']
let runWithTenant: (typeof import('../src/lib/tenant-context'))['runWithTenant']
let minioClient: (typeof import('../src/lib/minio'))['minioClient']
let getMinioBucket: (typeof import('../src/lib/minio'))['getMinioBucket']
let computeDHash: (typeof import('../src/lib/image-hash'))['computeDHash']

async function loadModules() {
  ;({ prisma } = await import('../src/lib/db'))
  ;({ runWithTenant } = await import('../src/lib/tenant-context'))
  ;({ minioClient, getMinioBucket } = await import('../src/lib/minio'))
  ;({ computeDHash } = await import('../src/lib/image-hash'))
}

/** A cover carried over by `transferStagingCoverToSet` before it stored under a
 *  prefix of its own: filename `cover.jpg` on the old `set/{setId}/…` path. New
 *  transfers write under `session/…` and bring their own hashes. */
const TRANSFERRED = {
  filename: 'cover.jpg',
  variants: { path: ['master_4000'], string_starts_with: 'set/' },
} as const

async function download(key: string): Promise<Buffer> {
  const res = await minioClient.send(new GetObjectCommand({ Bucket: getMinioBucket(), Key: key }))
  const chunks: Buffer[] = []
  for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function backfill(tenant: string) {
  console.log(`\n=== ${tenant} ===`)

  const unhashed = await prisma.mediaItem.findMany({
    where: { ...TRANSFERRED, phash: null },
    select: { id: true, variants: true },
  })
  console.log(`  ${unhashed.length} transferred cover(s) without a perceptual hash`)

  if (!apply) {
    console.log('  (dry run — pass --apply to write)')
    return
  }

  let hashed = 0
  let unreadable = 0
  for (const item of unhashed) {
    const key = (item.variants as { master_4000?: string } | null)?.master_4000
    if (!key) continue
    try {
      const phash = await computeDHash(await download(key))
      await prisma.mediaItem.update({ where: { id: item.id }, data: { phash } })
      hashed++
    } catch (err) {
      unreadable++
      console.warn(`    ${key}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`  hashed ${hashed}${unreadable ? `, ${unreadable} unreadable` : ''}`)
}

async function main() {
  await loadModules()
  if (!prod) return backfill('dev')
  const tenants = (process.env.TENANT_REGISTRY ?? 'pulse')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  for (const tenant of tenants) await runWithTenant(tenant, () => backfill(tenant))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .then(() => process.exit(0))
