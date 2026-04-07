/**
 * Transfer a staging set cover image to a production Set's media.
 *
 * Downloads the staging cover from MinIO, generates all standard variants
 * via uploadPhotoToStorage, then creates a MediaItem linked to the set
 * (which auto-sets it as the cover if the set doesn't have one yet).
 */

import { randomUUID } from 'crypto'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { uploadPhotoToStorage } from '@/lib/media-upload'
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
    'set',
    setId,
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
  })
}
