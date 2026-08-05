/**
 * Person portraits harvested from the person catalogue.
 *
 * Keyed on the ICG-ID alone, because that is the only key the catalogue and the
 * app reliably share: of 5,074 suggested identities, 4,269 have neither a Person
 * nor a Contact to hang a portrait off — and those are exactly the ones the
 * operator has no face for. The catalogue keeps one per person folder
 * (`Alisa_(AI-00QAS)_thumb.jpg`), which the agent uploads here.
 *
 * Mirrors `archive-cover-service.ts` deliberately: one bad image fails one
 * person, the reason is stored rather than logged, and a re-run retries only what
 * has no image or a recorded error. That shape exists because this project has
 * twice had a long run die on a single corrupt file.
 */
import { prisma } from '@/lib/db'
import sharp from 'sharp'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { ICG_ID_RE } from '@/lib/icg-id'

const AVATAR_MAX_PX = 256
const AVATAR_QUALITY = 82

export type CatalogueAvatarStats = {
  total: number
  withImage: number
  failed: number
}

/**
 * Store a portrait for an ICG-ID.
 *
 * `failOn: 'error'` stays strict. The established rule in this project is to
 * clean or re-encode an offending source, never to loosen the decoder — a
 * silently mangled portrait is worse than a reported failure, because it becomes
 * the face someone is compared against.
 */
export async function setCatalogueAvatar(
  icgId: string,
  buffer: Buffer,
): Promise<{ key: string; width: number; height: number }> {
  if (!ICG_ID_RE.test(icgId)) throw new Error(`Not an ICG-ID: ${icgId}`)

  const processed = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: AVATAR_MAX_PX, height: AVATAR_MAX_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: AVATAR_QUALITY })
    .toBuffer({ resolveWithObject: true })

  const key = `catalogue/avatar/${icgId}-${Date.now()}.jpg`
  await minioClient.send(
    new PutObjectCommand({
      Bucket: getMinioBucket(),
      Key: key,
      Body: processed.data,
      ContentType: 'image/jpeg',
    }),
  )

  await prisma.catalogueAvatar.upsert({
    where: { icgId },
    create: { icgId, key, error: null, checkedAt: new Date() },
    update: { key, error: null, checkedAt: new Date() },
  })

  return { key, width: processed.info.width, height: processed.info.height }
}

/** Record why a portrait could not be read, so the run continues and the file is nameable. */
export async function setCatalogueAvatarError(icgId: string, message: string): Promise<void> {
  if (!ICG_ID_RE.test(icgId)) throw new Error(`Not an ICG-ID: ${icgId}`)
  await prisma.catalogueAvatar.upsert({
    where: { icgId },
    create: { icgId, error: message.slice(0, 500), checkedAt: new Date() },
    update: { error: message.slice(0, 500), checkedAt: new Date() },
  })
}

/**
 * The ICG-IDs that already have a portrait, so the agent can skip them.
 *
 * Returned as a plain array rather than paged: ~39k short strings is well under a
 * megabyte, and one request beats the agent asking per person.
 */
export async function listCatalogueAvatarIds(): Promise<string[]> {
  const rows = await prisma.catalogueAvatar.findMany({
    where: { key: { not: null } },
    select: { icgId: true },
  })
  return rows.map((r) => r.icgId)
}

export async function getCatalogueAvatarStats(): Promise<CatalogueAvatarStats> {
  const [total, withImage, failed] = await Promise.all([
    prisma.catalogueAvatar.count(),
    prisma.catalogueAvatar.count({ where: { key: { not: null } } }),
    prisma.catalogueAvatar.count({ where: { error: { not: null } } }),
  ])
  return { total, withImage, failed }
}

/** Portraits that could not be read — the actionable list, as with cover failures. */
export async function listCatalogueAvatarFailures(
  limit = 50,
): Promise<{ icgId: string; error: string }[]> {
  const rows = await prisma.catalogueAvatar.findMany({
    where: { error: { not: null } },
    select: { icgId: true, error: true },
    orderBy: { checkedAt: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({ icgId: r.icgId, error: r.error! }))
}
