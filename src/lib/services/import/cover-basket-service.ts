import { randomUUID } from 'crypto'
import sharp from 'sharp'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { prisma } from '@/lib/db'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { buildUrl } from '@/lib/media-url'
import type { CoverBasket, CoverBasketItem, CoverBasketItemStatus } from '@/generated/prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────────

export type UploadedFile = {
  originalFilename: string
  buffer: Buffer
  fileSize: number
}

export type CoverBasketWithItems = CoverBasket & {
  items: CoverBasketItemWithMatch[]
}

export type CoverBasketItemWithMatch = CoverBasketItem & {
  thumbnailUrl: string
  matchedSet: {
    id: string
    title: string
    externalId: string | null
    channelName: string
    releaseDate: Date | null
  } | null
}

type MatchCandidate = {
  id: string
  externalId: string | null
  channelName: string
  channel: { shortName: string | null } | null
  releaseDate: Date | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 120)
}

/** Server-side port of the client-side computeMatches logic from batch-cover-upload-sheet.tsx */
function matchFilenameToSets(
  filename: string,
  sets: MatchCandidate[],
  usedSetIds: Set<string>,
): { setId: string; confidence: 'high' | 'medium' } | null {
  const lower = filename.toLowerCase()

  // Sort by externalId length descending — longer IDs claim files first (prevents substring collision)
  const sorted = [...sets]
    .filter((s) => s.externalId && !usedSetIds.has(s.id))
    .sort((a, b) => (b.externalId?.length ?? 0) - (a.externalId?.length ?? 0))

  for (const set of sorted) {
    const extId = set.externalId!.toLowerCase()
    if (!lower.includes(extId)) continue

    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-/)
    const fileDate = dateMatch?.[1] ?? null
    const setDate = set.releaseDate
      ? new Date(set.releaseDate).toISOString().split('T')[0]
      : null
    const dateOk = !fileDate || !setDate || fileDate === setDate

    const channelShort = (set.channel?.shortName ?? set.channelName ?? '').toLowerCase()
    const channelOk = !channelShort || lower.includes(channelShort)

    return {
      setId: set.id,
      confidence: dateOk && channelOk ? 'high' : 'medium',
    }
  }

  return null
}

// ─── Core service functions ───────────────────────────────────────────────────

export async function getOrCreateBasket(
  personId: string,
  isVideo: boolean,
): Promise<CoverBasket> {
  return prisma.coverBasket.upsert({
    where: { personId_isVideo: { personId, isVideo } },
    create: { personId, isVideo },
    update: {},
  })
}

export async function getBasketWithItems(
  personId: string,
  isVideo: boolean,
): Promise<CoverBasketWithItems | null> {
  const basket = await prisma.coverBasket.findUnique({
    where: { personId_isVideo: { personId, isVideo } },
    include: {
      items: {
        include: {
          matchedSet: {
            select: {
              id: true,
              title: true,
              externalId: true,
              channelName: true,
              releaseDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!basket) return null

  return {
    ...basket,
    items: basket.items.map((item) => ({
      ...item,
      thumbnailUrl: buildUrl(item.minioKey),
    })),
  } as CoverBasketWithItems
}

export async function addItemsToBasket(
  basketId: string,
  files: UploadedFile[],
): Promise<CoverBasketItem[]> {
  const bucket = getMinioBucket()
  const created: CoverBasketItem[] = []

  for (const file of files) {
    // Resize to max 800px, JPEG 80% — same processing as the cover upload route
    const processed = await sharp(file.buffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()

    const uniquePrefix = randomUUID().slice(0, 8)
    const safe = sanitizeFilename(file.originalFilename)
    const key = `cover-baskets/${basketId}/${uniquePrefix}-${safe}`

    await minioClient.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: processed,
        ContentType: 'image/jpeg',
      }),
    )

    const item = await prisma.coverBasketItem.create({
      data: {
        basketId,
        originalFilename: file.originalFilename,
        minioKey: key,
        fileSize: file.fileSize,
        status: 'PENDING',
      },
    })
    created.push(item)
  }

  return created
}

export async function runMatchingForBasket(
  basketId: string,
): Promise<{ matched: number; pending: number }> {
  const basket = await prisma.coverBasket.findUnique({
    where: { id: basketId },
    select: { id: true, personId: true, isVideo: true },
  })
  if (!basket) return { matched: 0, pending: 0 }

  return _runMatchingForBasketInternal(basket)
}

export async function runMatchingForPerson(personId: string): Promise<void> {
  const baskets = await prisma.coverBasket.findMany({
    where: { personId },
    select: { id: true, personId: true, isVideo: true },
  })
  for (const basket of baskets) {
    await _runMatchingForBasketInternal(basket)
  }
}

async function _runMatchingForBasketInternal(basket: {
  id: string
  personId: string
  isVideo: boolean
}): Promise<{ matched: number; pending: number }> {
  // Load PENDING items (don't re-run on already MATCHED/TRANSFERRED/IGNORED)
  const pendingItems = await prisma.coverBasketItem.findMany({
    where: { basketId: basket.id, status: 'PENDING' },
    select: { id: true, originalFilename: true },
  })
  if (pendingItems.length === 0) return { matched: 0, pending: 0 }

  // Load staging sets for this person that don't yet have a local cover
  const candidateSets = await prisma.stagingSet.findMany({
    where: {
      status: { notIn: ['PROMOTED', 'INACTIVE'] },
      isVideo: basket.isVideo,
      OR: [{ subjectPersonId: basket.personId }, { subjectIcgId: basket.personId }],
      AND: [
        {
          OR: [
            { coverImageUrl: null },
            { coverImageUrl: { not: { contains: '/staging/' } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      externalId: true,
      channelName: true,
      releaseDate: true,
      channel: { select: { shortName: true } },
    },
  })

  // Track which set IDs already have a MATCHED basket item (avoid double-matching)
  const alreadyMatched = await prisma.coverBasketItem.findMany({
    where: {
      basket: { personId: basket.personId },
      status: { in: ['MATCHED', 'TRANSFERRED'] },
      matchedSetId: { not: null },
    },
    select: { matchedSetId: true },
  })
  const usedSetIds = new Set(alreadyMatched.map((i) => i.matchedSetId!))

  let matched = 0
  let pending = 0

  for (const item of pendingItems) {
    const result = matchFilenameToSets(item.originalFilename, candidateSets, usedSetIds)
    if (result) {
      await prisma.coverBasketItem.update({
        where: { id: item.id },
        data: { status: 'MATCHED', matchedSetId: result.setId },
      })
      usedSetIds.add(result.setId)
      matched++
    } else {
      pending++
    }
  }

  return { matched, pending }
}

export async function transferItem(itemId: string): Promise<{ url: string }> {
  const item = await prisma.coverBasketItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      minioKey: true,
      status: true,
      matchedSetId: true,
    },
  })
  if (!item) throw new Error('Basket item not found')
  if (!item.matchedSetId) throw new Error('No staging set matched to this item')

  const bucket = getMinioBucket()

  // Fetch the basket file
  const getResult = await minioClient.send(
    new GetObjectCommand({ Bucket: bucket, Key: item.minioKey }),
  )
  const chunks: Uint8Array[] = []
  for await (const chunk of getResult.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  const stagingSetId = item.matchedSetId
  const version = Date.now()
  const newKey = `staging/${stagingSetId}/cover-${version}.jpg`

  // Delete any existing cover objects for this staging set
  const listed = await minioClient.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: `staging/${stagingSetId}/cover-` }),
  )
  for (const obj of listed.Contents ?? []) {
    if (obj.Key) {
      await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
    }
  }

  // Write the transferred cover
  await minioClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: newKey,
      Body: buffer,
      ContentType: 'image/jpeg',
    }),
  )

  const url = buildUrl(newKey)

  await prisma.$transaction([
    prisma.stagingSet.update({
      where: { id: stagingSetId },
      data: { coverImageUrl: url },
    }),
    prisma.coverBasketItem.update({
      where: { id: itemId },
      data: { status: 'TRANSFERRED', transferredAt: new Date() },
    }),
  ])

  return { url }
}

export async function transferAllMatched(
  basketId: string,
): Promise<{ transferred: number; errors: number }> {
  const items = await prisma.coverBasketItem.findMany({
    where: { basketId, status: 'MATCHED', matchedSetId: { not: null } },
    select: { id: true },
  })

  let transferred = 0
  let errors = 0

  for (const item of items) {
    try {
      await transferItem(item.id)
      transferred++
    } catch {
      errors++
    }
  }

  return { transferred, errors }
}

export async function updateItemStatus(
  itemId: string,
  status: CoverBasketItemStatus,
  matchedSetId?: string | null,
): Promise<CoverBasketItem> {
  return prisma.coverBasketItem.update({
    where: { id: itemId },
    data: {
      status,
      matchedSetId: matchedSetId !== undefined ? matchedSetId : undefined,
    },
  })
}

export async function deleteItem(itemId: string): Promise<void> {
  const item = await prisma.coverBasketItem.findUnique({
    where: { id: itemId },
    select: { minioKey: true },
  })
  if (!item) return

  const bucket = getMinioBucket()
  try {
    await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.minioKey }))
  } catch {
    // ignore — item may have already been deleted
  }

  await prisma.coverBasketItem.delete({ where: { id: itemId } })
}
