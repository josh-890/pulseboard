/**
 * Backfill: copy covers from photo staging sets to their video siblings.
 *
 * Finds all video staging sets (siblingId != null) that have no local cover
 * but whose photo sibling does. Copies the photo sibling's cover to a new
 * MinIO key for the video set and updates coverImageUrl.
 *
 * Safe to run multiple times — skips video sets that already have a local cover.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." MINIO_URL="..." MINIO_BUCKET="..." npx tsx scripts/backfill-sibling-video-covers.ts [--dry-run]
 *
 * For prod:
 *   source .env.production && DATABASE_URL=$TENANT_PULSE_DATABASE_URL npx tsx scripts/backfill-sibling-video-covers.ts
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const dryRun = process.argv.includes('--dry-run')

const minioEndpoint = process.env.MINIO_ENDPOINT!
const minioPort = process.env.MINIO_PORT!
const minioUseSSL = process.env.MINIO_USE_SSL === 'true'
const minioBucket = process.env.MINIO_BUCKET!
const minioProtocol = minioUseSSL ? 'https' : 'http'
const minioBase = `${minioProtocol}://${minioEndpoint}:${minioPort}`

const minioClient = new S3Client({
  endpoint: minioBase,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
})

function buildUrl(key: string): string {
  return `${minioBase}/${minioBucket}/${key}`
}

function extractKey(url: string): string | null {
  // URL format: http://host:port/bucket/key/path
  const prefix = `/${minioBucket}/`
  const idx = url.indexOf(prefix)
  return idx >= 0 ? url.slice(idx + prefix.length) : null
}

async function main() {
  console.log(dryRun ? '[DRY RUN] No changes will be made.\n' : '')
  console.log(`Endpoint: ${minioBase}  Bucket: ${minioBucket}\n`)

  // Find video siblings with no local cover whose photo sibling has a local cover
  const videoSets = await prisma.stagingSet.findMany({
    where: {
      siblingId: { not: null },
      OR: [
        { coverImageUrl: null },
        { coverImageUrl: { not: { contains: '/staging/' } } },
      ],
      sibling: {
        coverImageUrl: { contains: '/staging/' },
      },
    },
    select: {
      id: true,
      title: true,
      sibling: { select: { id: true, coverImageUrl: true } },
    },
  })

  console.log(`Found ${videoSets.length} video sibling set(s) needing a cover.\n`)
  if (videoSets.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let copied = 0
  let skipped = 0
  let errors = 0

  for (const vs of videoSets) {
    const photoSet = vs.sibling!
    const sourceUrl = photoSet.coverImageUrl!
    const sourceKey = extractKey(sourceUrl)

    if (!sourceKey) {
      console.warn(`  SKIP  ${vs.id} — could not extract key from URL: ${sourceUrl}`)
      skipped++
      continue
    }

    const destKey = `staging/${vs.id}/cover-${Date.now()}.jpg`
    console.log(`  ${vs.title ?? vs.id}`)
    console.log(`    src: ${sourceKey}`)
    console.log(`    dst: ${destKey}`)

    if (dryRun) {
      console.log('    [dry-run: skipped]\n')
      copied++
      continue
    }

    try {
      // Fetch source image
      const getResult = await minioClient.send(
        new GetObjectCommand({ Bucket: minioBucket, Key: sourceKey }),
      )
      const chunks: Uint8Array[] = []
      for await (const chunk of getResult.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      // Delete any existing cover keys for the video set
      const listed = await minioClient.send(
        new ListObjectsV2Command({ Bucket: minioBucket, Prefix: `staging/${vs.id}/cover-` }),
      )
      for (const obj of listed.Contents ?? []) {
        if (obj.Key) {
          await minioClient.send(new DeleteObjectCommand({ Bucket: minioBucket, Key: obj.Key }))
        }
      }

      // Write copy
      await minioClient.send(
        new PutObjectCommand({
          Bucket: minioBucket,
          Key: destKey,
          Body: buffer,
          ContentType: 'image/jpeg',
        }),
      )

      // Update DB
      await prisma.stagingSet.update({
        where: { id: vs.id },
        data: { coverImageUrl: buildUrl(destKey) },
      })

      console.log('    OK\n')
      copied++
    } catch (err) {
      console.error(`    ERROR: ${err}\n`)
      errors++
    }
  }

  console.log(`\nDone. copied=${copied}  skipped=${skipped}  errors=${errors}`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
