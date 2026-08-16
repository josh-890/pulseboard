/**
 * Transfer a staging set cover image to a production Set's media.
 *
 * Downloads the staging cover from MinIO, generates all standard variants
 * via uploadPhotoToStorage, then creates a MediaItem linked to the set
 * (which auto-sets it as the cover if the set doesn't have one yet).
 *
 * Two things this deliberately does the same way an upload does:
 *
 * - **It stores under the session.** A transferred cover is a picture of the
 *   set, so it lives where the set's other pictures live. The prefix is not
 *   load-bearing (the audit lists objects and matches `variants`; deletion uses
 *   explicit keys), but `set/{setId}/…` made these items look like a separate
 *   species in every bucket listing.
 * - **It computes hash and phash.** Without them the item was invisible to
 *   `/media/similar`, which only considers a non-null phash — and for a set born
 *   in the archive the very same picture arrives again, full size, on the next
 *   upload. The sha256 cannot match it (this is a re-encode), so the perceptual
 *   hash is the one that does the work.
 *
 * Whether the cover is a stand-in depends on where it came from — see
 * `isProvisionalCoverKey`.
 */

import { randomUUID } from 'crypto'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { uploadPhotoToStorage } from '@/lib/media-upload'
import { computeDHash, computeSha256 } from '@/lib/image-hash'
import { createMediaItemDirect } from '@/lib/services/media-service'
import { prisma } from '@/lib/db'

/**
 * Extract the MinIO storage key from a full URL.
 * URL format: http://host:port/bucket/staging/{id}/cover.jpg
 * Returns: staging/{id}/cover.jpg
 */
function extractKeyFromUrl(url: string): string {
  const bucket = getMinioBucket()
  const idx = url.indexOf(`/${bucket}/`)
  if (idx === -1) throw new Error(`Cannot extract key from URL: ${url}`)
  return url.slice(idx + bucket.length + 2) // skip /{bucket}/
}

/**
 * Is this cover a stand-in, or a picture in its own right?
 *
 * Two kinds of image arrive here and they are not the same thing:
 *
 * - `archive/…` — a 512 px thumbnail the app made of one of the folder's own
 *   images, so a staged set developed from an orphan folder shows something.
 *   A stand-in: once the folder's images are uploaded, the original is in the
 *   set at full size and this is a small duplicate holding the cover slot.
 * - `staging/…` — the cover that came with the import. A different picture from
 *   anything in the set, chosen by whoever published it, and the reason the
 *   transfer exists at all. Never a stand-in.
 *
 * On xpulse all 435 transferred covers are of the second kind (up to 1200 px, and
 * the closest set image is 14–19 bits away in dHash — a different photograph).
 * Marking those provisional would hand the cover to an arbitrary set image.
 */
export function isProvisionalCoverKey(key: string): boolean {
  return key.startsWith('archive/')
}

export async function transferStagingCoverToSet(
  coverImageUrl: string,
  setId: string,
): Promise<void> {
  // Find the primary session for this set (needed for MediaItem)
  const setSession = await prisma.setSession.findFirst({
    where: { setId, isPrimary: true },
    select: { sessionId: true },
  })
  if (!setSession) {
    console.warn('Cover transfer: no primary session for set', setId)
    return
  }

  // Check if set already has a cover
  const set = await prisma.set.findUnique({
    where: { id: setId },
    select: { coverMediaItemId: true },
  })
  if (set?.coverMediaItemId) {
    // Already has a cover — skip
    return
  }

  // Download the staging cover from MinIO
  const key = extractKeyFromUrl(coverImageUrl)
  const result = await minioClient.send(
    new GetObjectCommand({
      Bucket: getMinioBucket(),
      Key: key,
    }),
  )
  const chunks: Buffer[] = []
  for await (const chunk of result.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  // Generate all variants via the standard upload pipeline
  const photoId = randomUUID()
  const uploadResult = await uploadPhotoToStorage(
    buffer,
    'image/jpeg',
    'session',
    setSession.sessionId,
    photoId,
  )

  // Create a MediaItem linked to the set (auto-assigns as cover)
  await createMediaItemDirect({
    sessionId: setSession.sessionId,
    setId,
    filename: 'cover.jpg',
    mimeType: 'image/jpeg',
    size: buffer.length,
    originalWidth: uploadResult.originalWidth,
    originalHeight: uploadResult.originalHeight,
    variants: uploadResult.variants,
    hash: computeSha256(buffer),
    phash: await computeDHash(buffer),
    provisionalCover: isProvisionalCoverKey(key),
  })
}
