import sharp from 'sharp'
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/db'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { buildUrl } from '@/lib/media-url'
import { getSetting, setSetting } from '@/lib/services/setting-service'

// ADR-0038 S7: covers on request. Set covers stay in the catalogue on the
// Windows box until a set is worked on: Develop, Review of a newer file, or
// opening a staged set without a cover records what is wanted; the scheduled
// agent pass delivers it from `_meta\_Cover\` (photo) / `_meta\_Videos\` (video),
// or reports it is not there. Every delivered cover is decoded strictly.

export type CoverRequestReason = 'develop' | 'review' | 'opened'
export type CoverRequestStatus = 'WANTED' | 'DELIVERED' | 'NOT_FOUND' | 'FAILED'

const COVER_WIDTH = 800
const COVER_QUALITY = 80

/** A cover the app holds (MinIO), as opposed to none or a harvested source URL */
export const hasLocalCover = (url: string | null | undefined) => Boolean(url?.includes('/staging/'))

/** Write a staged set's cover (replacing the earlier one) — the upload route and deliveries share it */
export async function storeStagingCover(stagingSetId: string, jpeg: Buffer): Promise<string> {
  const bucket = getMinioBucket()
  // A versioned key: the URL changes with every cover, so no browser shows the old one
  const key = `staging/${stagingSetId}/cover-${Date.now()}.jpg`
  const listed = await minioClient.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `staging/${stagingSetId}/cover-` }))
  for (const obj of listed.Contents ?? []) {
    if (obj.Key && obj.Key !== key) await minioClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
  }
  await minioClient.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: jpeg, ContentType: 'image/jpeg' }))
  const url = buildUrl(key)
  await prisma.stagingSet.update({ where: { id: stagingSetId }, data: { coverImageUrl: url } })
  return url
}

/** Downscaled like an upload; `strict` refuses a damaged file instead of storing half of it */
export async function toCoverJpeg(buffer: Buffer, strict = false): Promise<Buffer> {
  return sharp(buffer, strict ? { failOn: 'error' } : {})
    .rotate()
    .resize({ width: COVER_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: COVER_QUALITY })
    .toBuffer()
}

// ── Asking ───────────────────────────────────────────────────────────────────

/**
 * Record that these staged sets want their cover. Only open sets with a CoverId
 * and no cover of ours; one already wanted or settled stays as it is — except a
 * delivered one whose cover has gone since (asked again). Without a catalogue
 * folder for anyone in the cast it is NOT_FOUND at once.
 */
export async function requestCovers(stagingSetIds: string[], reason: CoverRequestReason): Promise<{ wanted: number }> {
  if (!stagingSetIds.length) return { wanted: 0 }
  const sets = await prisma.stagingSet.findMany({
    where: { id: { in: stagingSetIds }, status: { notIn: ['PROMOTED', 'INACTIVE'] }, externalId: { not: null } },
    select: {
      id: true, externalId: true, isVideo: true, subjectIcgId: true, participantIcgIds: true, coverImageUrl: true,
      coverRequest: { select: { status: true } },
    },
  })
  const need = sets.filter((s) => !hasLocalCover(s.coverImageUrl) && (!s.coverRequest || s.coverRequest.status === 'DELIVERED'))
  if (!need.length) return { wanted: 0 }

  const icgIds = [...new Set(need.flatMap((s) => [s.subjectIcgId, ...s.participantIcgIds].filter((x): x is string => Boolean(x))))]
  const folders = await prisma.catalogueFolder.findMany({
    where: { icgId: { in: icgIds }, goneAt: null },
    select: { icgId: true, path: true },
  })
  const pathsOf = new Map<string, string[]>()
  for (const f of folders) pathsOf.set(f.icgId!, [...(pathsOf.get(f.icgId!) ?? []), f.path])

  let wanted = 0
  for (const s of need) {
    const order = [s.subjectIcgId, ...s.participantIcgIds].filter((x): x is string => Boolean(x))
    const folderPaths = [...new Set(order.flatMap((icg) => pathsOf.get(icg) ?? []))]
    const data = {
      coverId: s.externalId!,
      isVideo: s.isVideo,
      folderPaths,
      reason,
      status: folderPaths.length ? 'WANTED' : 'NOT_FOUND',
      detail: folderPaths.length ? null : 'No catalogue folder for anyone in the cast',
      requestedAt: new Date(),
      settledAt: folderPaths.length ? null : new Date(),
    }
    await prisma.catalogueCoverRequest.upsert({ where: { stagingSetId: s.id }, create: { stagingSetId: s.id, ...data }, update: data })
    if (folderPaths.length) wanted++
  }
  return { wanted }
}

/** Every open staged set of an import batch — Develop and Review ask for all of hers */
export async function requestCoversForBatch(batchId: string, reason: CoverRequestReason): Promise<{ wanted: number }> {
  const sets = await prisma.stagingSet.findMany({ where: { importBatchId: batchId }, select: { id: true } })
  return requestCovers(sets.map((s) => s.id), reason)
}

export type CoverRequestState = { status: CoverRequestStatus; detail: string | null; requestedAt: Date } | null

export async function getCoverRequest(stagingSetId: string): Promise<CoverRequestState> {
  const r = await prisma.catalogueCoverRequest.findUnique({
    where: { stagingSetId },
    select: { status: true, detail: true, requestedAt: true },
  })
  return r ? { ...r, status: r.status as CoverRequestStatus } : null
}

/** Ask again for the ones the catalogue did not have or that were damaged (after fixing it there) */
export async function retryCoverRequests(): Promise<number> {
  const { count } = await prisma.catalogueCoverRequest.updateMany({
    where: { status: { in: ['NOT_FOUND', 'FAILED'] }, folderPaths: { isEmpty: false } },
    data: { status: 'WANTED', detail: null, settledAt: null, requestedAt: new Date() },
  })
  return count
}

// ── The agent's side ─────────────────────────────────────────────────────────

export type WantedCover = { stagingSetId: string; coverId: string; isVideo: boolean; folderPaths: string[] }

export async function listWantedCovers(limit = 500): Promise<WantedCover[]> {
  return prisma.catalogueCoverRequest.findMany({
    where: { status: 'WANTED' },
    orderBy: { requestedAt: 'asc' },
    take: limit,
    select: { stagingSetId: true, coverId: true, isVideo: true, folderPaths: true },
  })
}

export type DeliveryResult = { status: CoverRequestStatus; detail?: string }

/** A cover the agent found: decoded strictly, downscaled, stored — unless it is no longer wanted */
export async function deliverCover(stagingSetId: string, fileName: string, data: Buffer): Promise<DeliveryResult> {
  const request = await prisma.catalogueCoverRequest.findUnique({ where: { stagingSetId }, select: { status: true } })
  if (!request || request.status !== 'WANTED') return { status: (request?.status as CoverRequestStatus) ?? 'NOT_FOUND', detail: 'not wanted' }
  const settle = (status: CoverRequestStatus, detail: string | null) =>
    prisma.catalogueCoverRequest.update({ where: { stagingSetId }, data: { status, detail, settledAt: new Date() } })

  const set = await prisma.stagingSet.findUnique({ where: { id: stagingSetId }, select: { coverImageUrl: true } })
  if (hasLocalCover(set?.coverImageUrl)) {
    // You gave it one meanwhile: yours stays
    await settle('DELIVERED', 'had a cover already')
    return { status: 'DELIVERED', detail: 'had a cover already' }
  }
  let jpeg: Buffer
  try {
    jpeg = await toCoverJpeg(data, true)
  } catch (err) {
    const detail = `${fileName}: damaged image — ${err instanceof Error ? err.message : String(err)}`.slice(0, 500)
    await settle('FAILED', detail)
    return { status: 'FAILED', detail }
  }
  await storeStagingCover(stagingSetId, jpeg)
  await settle('DELIVERED', fileName.slice(0, 500))
  return { status: 'DELIVERED' }
}

/** Covers the agent looked for and did not find */
export async function reportCoversNotFound(items: { stagingSetId: string; detail: string }[]): Promise<number> {
  let n = 0
  for (const it of items) {
    const { count } = await prisma.catalogueCoverRequest.updateMany({
      where: { stagingSetId: it.stagingSetId, status: 'WANTED' },
      data: { status: 'NOT_FOUND', detail: it.detail.slice(0, 500), settledAt: new Date() },
    })
    n += count
  }
  return n
}

// ── What the runs page shows ─────────────────────────────────────────────────

export const AGENT_PASS_SETTING = 'catalogue.agent.lastPass'

export type AgentPass = {
  at: string
  durationMs: number
  coversDelivered: number
  coversNotFound: number
  coversFailed: number
  /** Folders sent to a run — 0 when the catalogue had not changed (no run entry) */
  foldersSent: number
  runId: string | null
  error: string | null
}

export async function recordAgentPass(pass: AgentPass): Promise<void> {
  await setSetting(AGENT_PASS_SETTING, JSON.stringify(pass))
}

export async function getAgentPass(): Promise<AgentPass | null> {
  const raw = await getSetting(AGENT_PASS_SETTING)
  try {
    return raw ? (JSON.parse(raw) as AgentPass) : null
  } catch {
    return null
  }
}

export type CoverRequestStats = Record<CoverRequestStatus, number> & { deliveredToday: number }

export async function getCoverRequestStats(): Promise<CoverRequestStats> {
  const rows = await prisma.catalogueCoverRequest.groupBy({ by: ['status'], _count: { _all: true } })
  const out: CoverRequestStats = { WANTED: 0, DELIVERED: 0, NOT_FOUND: 0, FAILED: 0, deliveredToday: 0 }
  for (const r of rows) out[r.status as CoverRequestStatus] = r._count._all
  out.deliveredToday = await prisma.catalogueCoverRequest.count({
    where: { status: 'DELIVERED', settledAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
  })
  return out
}

export type UnsettledCover = { stagingSetId: string; title: string; coverId: string; status: CoverRequestStatus; detail: string | null }

/** The ones the catalogue did not have or that were damaged — newest first */
export async function listUnsettledCovers(limit = 50): Promise<UnsettledCover[]> {
  const rows = await prisma.catalogueCoverRequest.findMany({
    where: { status: { in: ['NOT_FOUND', 'FAILED'] } },
    orderBy: { settledAt: 'desc' },
    take: limit,
    select: { stagingSetId: true, coverId: true, status: true, detail: true, stagingSet: { select: { title: true } } },
  })
  return rows.map((r) => ({ stagingSetId: r.stagingSetId, coverId: r.coverId, status: r.status as CoverRequestStatus, detail: r.detail, title: r.stagingSet.title }))
}
