/**
 * Archive cover thumbnails (implementation plan slice 1).
 *
 * The archive workspace is a text-only tree, which makes judging 32k orphan
 * folders guesswork. The scan agent picks one image per folder (`*-c.jpg` when
 * present, else the first image), downscales it on the machine that holds the
 * archive, and POSTs only the thumbnail — the same "heavy data stays put"
 * pattern as the HD re-bake agent (ADR-0017).
 *
 * Failures are STORED, not just logged. One undecodable image must fail exactly
 * one folder and remain individually visible and fixable; it must never derail a
 * 34,662-folder run, and fixing it must not force a full redo.
 */
import sharp from 'sharp'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { minioClient, getMinioBucket } from '@/lib/minio'
import { prisma } from '@/lib/db'
import { escapeLike } from '@/lib/prisma-like'

/** Long edge of the stored thumbnail. Enough for a tree row plus a hover preview. */
const COVER_MAX_PX = 512
const COVER_QUALITY = 80

/**
 * Mirror of archive-scan.ps1's Normalize-Path: trim trailing separators and fold
 * forward slashes to backslashes. The two scripts share a -Path argument, so they
 * have to agree on what a scope means — otherwise the same string scopes one and
 * silently matches nothing in the other.
 */
function normalizeScopePath(p: string): string {
  return p.replace(/[/\\]+$/, '').replace(/\//g, '\\')
}

export type CoverWorklistEntry = {
  archiveKey: string
  fullPath: string
  isVideo: boolean
  /** Previous failure, so the agent can report whether a retry fixed it. */
  previousError: string | null
}

/**
 * Folders still needing a cover attempt: no cover yet, or a recorded failure.
 * A folder that already has a cover is never revisited — that is what keeps a
 * re-run after fixing one image cheap.
 */
export async function getCoverWorklist(opts: {
  limit?: number
  retryFailed?: boolean
  pathPrefix?: string
} = {}): Promise<CoverWorklistEntry[]> {
  const rows = await prisma.archiveFolder.findMany({
    where: {
      missingOnDisk: false,
      coverKey: null,
      // Default skips folders that already failed, so a plain re-run does not
      // grind through known-bad images every time. --retry-failed opts in.
      ...(opts.retryFailed ? {} : { coverError: null }),
      // Two things are mandatory here, and both fail the same silent way — an
      // empty result that looks like "nothing to do":
      //   escapeLike — fullPath is a Windows path and LIKE treats the backslash
      //     as its escape character, so the raw prefix matches nothing at all.
      //   insensitive — archive-scan.ps1's -Path compares through Normalize-Path
      //     (lower-cased), so the same argument must be case-insensitive here or
      //     the two scripts would disagree about what a scope means.
      ...(opts.pathPrefix
        ? {
            fullPath: {
              startsWith: escapeLike(normalizeScopePath(opts.pathPrefix)),
              mode: 'insensitive' as const,
            },
          }
        : {}),
    },
    select: { archiveKey: true, fullPath: true, isVideo: true, coverError: true },
    orderBy: { fullPath: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  })
  return rows.map((r) => ({
    archiveKey: r.archiveKey,
    fullPath: r.fullPath,
    isVideo: r.isVideo,
    previousError: r.coverError,
  }))
}

/**
 * Store a thumbnail for one folder. The key carries a timestamp so a replaced
 * cover cannot be served from cache under the old URL (same reason the re-bake
 * route writes fresh keys).
 *
 * Sharp stays strict on decode: a thumbnail that only *looks* fine because the
 * decoder was told to tolerate damage is worse than a reported failure. A reject
 * here surfaces as a stored coverError, not a silent pass.
 */
export async function setArchiveFolderCover(
  archiveKey: string,
  buffer: Buffer,
): Promise<{ coverKey: string; width: number; height: number }> {
  const folder = await prisma.archiveFolder.findUnique({
    where: { archiveKey },
    select: { id: true },
  })
  if (!folder) throw new Error('Archive folder not found')

  const image = sharp(buffer, { failOn: 'error' }).rotate()
  const processed = await image
    .resize({ width: COVER_MAX_PX, height: COVER_MAX_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: COVER_QUALITY })
    .toBuffer({ resolveWithObject: true })

  const coverKey = `archive/${archiveKey}/cover-${Date.now()}.jpg`
  await minioClient.send(
    new PutObjectCommand({
      Bucket: getMinioBucket(),
      Key: coverKey,
      Body: processed.data,
      ContentType: 'image/jpeg',
    }),
  )

  await prisma.archiveFolder.update({
    where: { archiveKey },
    data: { coverKey, coverError: null, coverCheckedAt: new Date() },
  })

  return { coverKey, width: processed.info.width, height: processed.info.height }
}

/**
 * Drop a folder's cover so the agent picks it up again.
 *
 * This is the whole "refresh a cover" story, and deliberately so: the worklist
 * invariant is "folders without a cover", and a deleted cover simply satisfies
 * it. No agent flag, no special case — and therefore no way to trigger a
 * 34k-image re-upload by mistake.
 *
 * Clears coverError too, so a folder that previously failed returns to plain
 * pending rather than staying in the defect list.
 */
export async function clearArchiveFolderCover(folderId: string): Promise<void> {
  // Keyed on the folder id, not the archiveKey: this is the in-app path and the
  // workspace rows already carry the id. archiveKey stays the agent's currency.
  const folder = await prisma.archiveFolder.findUnique({
    where: { id: folderId },
    select: { coverKey: true },
  })
  if (!folder) throw new Error('Archive folder not found')

  // Best-effort object removal: a stale blob is harmless (the key is timestamped,
  // so nothing can serve it once the column is null), and failing to delete it
  // must not stop the folder from being re-covered.
  if (folder.coverKey) {
    try {
      await minioClient.send(
        new DeleteObjectCommand({ Bucket: getMinioBucket(), Key: folder.coverKey }),
      )
    } catch (err) {
      console.error('[archive-cover] could not delete the MinIO object', folder.coverKey, err)
    }
  }

  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { coverKey: null, coverError: null, coverCheckedAt: null },
  })
}

/** Record a per-folder failure. Leaves any existing cover in place. */
export async function setArchiveFolderCoverError(
  archiveKey: string,
  message: string,
): Promise<void> {
  await prisma.archiveFolder.update({
    where: { archiveKey },
    // Truncated: these come from a remote agent and are shown in a table cell.
    data: { coverError: message.slice(0, 500), coverCheckedAt: new Date() },
  })
}

export type CoverStats = {
  total: number
  withCover: number
  failed: number
  pending: number
}

/**
 * The defect list: folders whose cover could not be produced, with the reason.
 * Surfaced by the ICG-style maintenance check so each failure is individually
 * visible and actionable — the whole point of storing coverError rather than
 * only logging it on the agent side.
 */
export async function listCoverFailures(limit = 200): Promise<
  { fullPath: string; error: string }[]
> {
  const rows = await prisma.archiveFolder.findMany({
    where: { missingOnDisk: false, coverKey: null, coverError: { not: null } },
    select: { fullPath: true, coverError: true },
    orderBy: { fullPath: 'asc' },
    take: limit,
  })
  return rows.map((r) => ({ fullPath: r.fullPath, error: r.coverError ?? '' }))
}

/** Progress + defect counts for the workspace and the maintenance page. */
export async function getCoverStats(): Promise<CoverStats> {
  const [total, withCover, failed] = await Promise.all([
    prisma.archiveFolder.count({ where: { missingOnDisk: false } }),
    prisma.archiveFolder.count({ where: { missingOnDisk: false, coverKey: { not: null } } }),
    prisma.archiveFolder.count({
      where: { missingOnDisk: false, coverKey: null, coverError: { not: null } },
    }),
  ])
  return { total, withCover, failed, pending: total - withCover - failed }
}
