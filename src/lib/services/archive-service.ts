/**
 * Archive service — manages physical media archive path tracking
 * and the media queue for both StagingSet and Set records.
 *
 * The archive path points to the physical folder on the local filesystem
 * (e.g. x:\Sites\MA-MySite\2012\2012-08-08-MA Jane - Waterworld\).
 * A separate scan script reads the filesystem and calls ingestScanResults()
 * via the /api/archive/ingest API route.
 */

import { prisma } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/services/setting-service'
import type { ArchiveStatus } from '@/generated/prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

export const ARCHIVE_PHOTOSET_ROOT_KEY = 'archive.photosetRoot'
export const ARCHIVE_VIDEOSET_ROOT_KEY = 'archive.videosetRoot'
export const ARCHIVE_LAST_SCAN_KEY = 'archive.lastScan'
export const ARCHIVE_LAST_SCAN_SUMMARY_KEY = 'archive.lastScanSummary'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArchivePathEntry = {
  id: string
  type: 'staging' | 'set'
  path: string
  isVideo: boolean
  /** The expected video file name (without extension) for videosets */
  folderName: string
}

export type ScanResult = {
  id: string
  type: 'staging' | 'set'
  path: string
  exists: boolean
  fileCount: number | null
  videoPresent: boolean | null
  error: string | null
}

export type MediaQueueItem = {
  id: string
  type: 'staging' | 'set'
  title: string
  channelName: string | null
  releaseDate: Date | null
  isVideo: boolean
  mediaPriority: number
  mediaQueueAt: Date
  archivePath: string | null
  archiveStatus: ArchiveStatus
  archiveFileCount: number | null
  archiveVideoPresent: boolean | null
}

// ─── Path Construction ────────────────────────────────────────────────────────

/**
 * Build the expected RELATIVE archive path for a staging set.
 * Relative means: {chanFolder}\{year}\{folderName}\
 * The root (e.g. x:\Sites\) is NOT included — it lives in Settings and may change.
 * Returns null if essential data (shortName, releaseDate) is missing.
 */
export async function buildExpectedPathForStagingSet(stagingSetId: string): Promise<string | null> {
  const ss = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    select: {
      releaseDate: true,
      isVideo: true,
      title: true,
      participants: true,
      channel: { select: { shortName: true, channelFolder: true } },
    },
  })
  if (!ss || !ss.releaseDate || !ss.channel?.shortName) return null

  return _buildRelativePath({
    releaseDate: ss.releaseDate,
    shortName: ss.channel.shortName,
    channelFolder: ss.channel.channelFolder,
    title: ss.title,
    firstParticipantName: _firstParticipant(ss.participants),
  })
}

/**
 * Build the expected RELATIVE archive path for a promoted Set.
 */
export async function buildExpectedPathForSet(setId: string): Promise<string | null> {
  const set = await prisma.set.findUnique({
    where: { id: setId },
    select: {
      releaseDate: true,
      type: true,
      title: true,
      channel: { select: { shortName: true, channelFolder: true } },
      participants: {
        select: { person: { select: { aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } } } },
        take: 1,
      },
    },
  })
  if (!set || !set.releaseDate || !set.channel?.shortName) return null

  const firstParticipantName = set.participants[0]?.person.aliases[0]?.name ?? null

  return _buildRelativePath({
    releaseDate: set.releaseDate,
    shortName: set.channel.shortName,
    channelFolder: set.channel.channelFolder,
    title: set.title,
    firstParticipantName,
  })
}

/**
 * Reconstruct the full filesystem path from a stored relative path.
 * Returns null if the root is not configured in Settings.
 */
export async function buildFullPath(relativePath: string, isVideo: boolean): Promise<string | null> {
  const rootKey = isVideo ? ARCHIVE_VIDEOSET_ROOT_KEY : ARCHIVE_PHOTOSET_ROOT_KEY
  const root = await getSetting(rootKey)
  if (!root) return null
  const sep = root.includes('/') ? '/' : '\\'
  return root.replace(/[/\\]$/, '') + sep + relativePath
}

function _buildRelativePath(args: {
  releaseDate: Date
  shortName: string
  channelFolder: string | null
  title: string
  firstParticipantName: string | null
}): string {
  const dateStr = args.releaseDate.toISOString().split('T')[0] // yyyy-mm-dd
  const year = dateStr.slice(0, 4)
  const chanFolder = args.channelFolder ?? `${args.shortName}-unknown`
  const folderName = buildFolderName(dateStr, args.shortName, args.firstParticipantName, args.title)
  // Use backslash as separator — Windows paths; normalised by the scan script on other OS
  return `${chanFolder}\\${year}\\${folderName}\\`
}

/**
 * Build the set folder name segment: "yyyy-mm-dd-{shortName} {participant} - {title}"
 * Safe to call without an async context — used in the UI for auto-suggestion.
 */
export function buildFolderName(
  dateStr: string,
  shortName: string,
  firstParticipantName: string | null,
  title: string,
): string {
  const participant = firstParticipantName ?? 'Unknown'
  return `${dateStr}-${shortName} ${participant} - ${title}`
}

function _firstParticipant(participants: unknown): string | null {
  if (!Array.isArray(participants) || participants.length === 0) return null
  const p = participants[0] as { name?: string }
  return p.name ?? null
}

// ─── Path Management ──────────────────────────────────────────────────────────

/**
 * Extract the channel-folder segment from a relative path.
 * e.g. "FJ-Femjoy\2012\..." → "FJ-Femjoy"
 */
function _extractChannelFolderFromPath(relativePath: string): string | null {
  const segment = relativePath.split(/[/\\]/)[0]
  return segment?.trim() || null
}

export async function recordStagingSetArchivePath(id: string, path: string): Promise<void> {
  await prisma.stagingSet.update({
    where: { id },
    data: { archivePath: path, archiveStatus: 'PENDING' },
  })
  // Auto-learn channelFolder from the path if the channel doesn't have one yet
  const ss = await prisma.stagingSet.findUnique({
    where: { id },
    select: { channelId: true, channel: { select: { channelFolder: true } } },
  })
  if (ss?.channelId && !ss.channel?.channelFolder) {
    const extracted = _extractChannelFolderFromPath(path)
    if (extracted) {
      await prisma.channel.update({
        where: { id: ss.channelId },
        data: { channelFolder: extracted },
      })
    }
  }
}

export async function clearStagingSetArchivePath(id: string): Promise<void> {
  await prisma.stagingSet.update({
    where: { id },
    data: {
      archivePath: null,
      archiveStatus: 'UNKNOWN',
      archiveLastChecked: null,
      archiveFileCount: null,
      archiveFileCountPrev: null,
      archiveVideoPresent: null,
    },
  })
}

export async function recordSetArchivePath(id: string, path: string): Promise<void> {
  await prisma.set.update({
    where: { id },
    data: { archivePath: path, archiveStatus: 'PENDING' },
  })
  // Auto-learn channelFolder from the path if the channel doesn't have one yet
  const set = await prisma.set.findUnique({
    where: { id },
    select: { channelId: true, channel: { select: { channelFolder: true } } },
  })
  if (set?.channelId && !set.channel?.channelFolder) {
    const extracted = _extractChannelFolderFromPath(path)
    if (extracted) {
      await prisma.channel.update({
        where: { id: set.channelId },
        data: { channelFolder: extracted },
      })
    }
  }
}

export async function clearSetArchivePath(id: string): Promise<void> {
  await prisma.set.update({
    where: { id },
    data: {
      archivePath: null,
      archiveStatus: 'UNKNOWN',
      archiveLastChecked: null,
      archiveFileCount: null,
      archiveFileCountPrev: null,
      archiveVideoPresent: null,
    },
  })
}

// ─── Scan API Support ─────────────────────────────────────────────────────────

/**
 * Returns all records with a recorded archivePath, for the scan script.
 * The `path` field is the FULL filesystem path (root + relative) reconstructed
 * from current Settings. Entries whose root is not configured are excluded.
 */
export async function getArchivePaths(): Promise<ArchivePathEntry[]> {
  // Load both roots upfront (one DB round-trip each)
  const [photoRoot, videoRoot, stagingSets, sets] = await Promise.all([
    getSetting(ARCHIVE_PHOTOSET_ROOT_KEY),
    getSetting(ARCHIVE_VIDEOSET_ROOT_KEY),
    prisma.stagingSet.findMany({
      where: { archivePath: { not: null } },
      select: {
        id: true,
        archivePath: true,
        isVideo: true,
        title: true,
        releaseDate: true,
        channel: { select: { shortName: true } },
        participants: true,
      },
    }),
    prisma.set.findMany({
      where: { archivePath: { not: null } },
      select: {
        id: true,
        archivePath: true,
        type: true,
        title: true,
        releaseDate: true,
        channel: { select: { shortName: true } },
        participants: {
          select: { person: { select: { aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } } } },
          take: 1,
        },
      },
    }),
  ])

  function toFullPath(relativePath: string, isVideo: boolean): string | null {
    const root = isVideo ? videoRoot : photoRoot
    if (!root) return null
    const sep = root.includes('/') ? '/' : '\\'
    return root.replace(/[/\\]$/, '') + sep + relativePath
  }

  const results: ArchivePathEntry[] = []

  for (const ss of stagingSets) {
    if (!ss.archivePath) continue
    const fullPath = toFullPath(ss.archivePath, ss.isVideo)
    if (!fullPath) continue // root not configured — skip
    const dateStr = ss.releaseDate?.toISOString().split('T')[0] ?? '0000-00-00'
    const shortName = ss.channel?.shortName ?? ''
    const first = _firstParticipant(ss.participants)
    results.push({
      id: ss.id,
      type: 'staging',
      path: fullPath,
      isVideo: ss.isVideo,
      folderName: buildFolderName(dateStr, shortName, first, ss.title),
    })
  }

  for (const set of sets) {
    if (!set.archivePath) continue
    const isVideo = set.type === 'video'
    const fullPath = toFullPath(set.archivePath, isVideo)
    if (!fullPath) continue
    const dateStr = set.releaseDate?.toISOString().split('T')[0] ?? '0000-00-00'
    const shortName = set.channel?.shortName ?? ''
    const first = set.participants[0]?.person.aliases[0]?.name ?? null
    results.push({
      id: set.id,
      type: 'set',
      path: fullPath,
      isVideo,
      folderName: buildFolderName(dateStr, shortName, first, set.title),
    })
  }

  return results
}

/** Called by the ingest API route to store scan results. */
export async function ingestScanResults(results: ScanResult[]): Promise<void> {
  const now = new Date()
  const counts = { ok: 0, changed: 0, missing: 0, incomplete: 0, errors: 0 }

  for (const r of results) {
    const status = _deriveStatus(r)

    // Count for summary
    if (status === 'OK') counts.ok++
    else if (status === 'CHANGED') counts.changed++
    else if (status === 'MISSING') counts.missing++
    else if (status === 'INCOMPLETE') counts.incomplete++
    if (r.error) counts.errors++

    if (r.type === 'staging') {
      // Shift current count → prev before writing new count
      const current = await prisma.stagingSet.findUnique({
        where: { id: r.id },
        select: { archiveFileCount: true },
      })
      const prevCount = current?.archiveFileCount ?? null
      const derivedStatus: ArchiveStatus =
        status === 'OK' && prevCount !== null && r.fileCount !== null && r.fileCount !== prevCount
          ? 'CHANGED'
          : status
      if (derivedStatus === 'CHANGED') { counts.changed++; counts.ok-- }
      await prisma.stagingSet.update({
        where: { id: r.id },
        data: {
          archiveStatus: derivedStatus,
          archiveLastChecked: now,
          archiveFileCount: r.fileCount,
          archiveFileCountPrev: prevCount,
          archiveVideoPresent: r.videoPresent,
        },
      })
    } else {
      const current = await prisma.set.findUnique({
        where: { id: r.id },
        select: { archiveFileCount: true },
      })
      const prevCount = current?.archiveFileCount ?? null
      const derivedStatus: ArchiveStatus =
        status === 'OK' && prevCount !== null && r.fileCount !== null && r.fileCount !== prevCount
          ? 'CHANGED'
          : status
      if (derivedStatus === 'CHANGED') { counts.changed++; counts.ok-- }
      await prisma.set.update({
        where: { id: r.id },
        data: {
          archiveStatus: derivedStatus,
          archiveLastChecked: now,
          archiveFileCount: r.fileCount,
          archiveFileCountPrev: prevCount,
          archiveVideoPresent: r.videoPresent,
        },
      })
    }
  }

  // Record last scan timestamp and summary
  const summary = `${results.length} checked — OK: ${counts.ok}, Changed: ${counts.changed}, Missing: ${counts.missing}, Incomplete: ${counts.incomplete}${counts.errors > 0 ? `, Errors: ${counts.errors}` : ''}`
  await setSetting(ARCHIVE_LAST_SCAN_KEY, now.toISOString())
  await setSetting(ARCHIVE_LAST_SCAN_SUMMARY_KEY, summary)
}

function _deriveStatus(r: ScanResult): ArchiveStatus {
  if (r.error || !r.exists) return 'MISSING'
  if (r.videoPresent === false) return 'INCOMPLETE'
  return 'OK'
  // Note: CHANGED is set separately after comparing prev/current counts in the update
}

// ─── Media Queue ──────────────────────────────────────────────────────────────

export async function getMediaQueue(filters: {
  isVideo?: boolean
  page?: number
  pageSize?: number
}): Promise<{ items: MediaQueueItem[]; total: number }> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const videoFilter = filters.isVideo !== undefined
    ? filters.isVideo
    : undefined

  const [stagingSets, sets, stagingTotal, setTotal] = await Promise.all([
    prisma.stagingSet.findMany({
      where: {
        mediaQueueAt: { not: null },
        ...(videoFilter !== undefined ? { isVideo: videoFilter } : {}),
      },
      select: {
        id: true,
        title: true,
        channelName: true,
        releaseDate: true,
        isVideo: true,
        mediaPriority: true,
        mediaQueueAt: true,
        archivePath: true,
        archiveStatus: true,
        archiveFileCount: true,
        archiveVideoPresent: true,
      },
      orderBy: [{ mediaPriority: 'asc' }, { releaseDate: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.set.findMany({
      where: {
        mediaQueueAt: { not: null },
        ...(videoFilter !== undefined ? { type: videoFilter ? ('video' as const) : { not: 'video' as const } } : {}),
      },
      select: {
        id: true,
        title: true,
        channel: { select: { name: true } },
        releaseDate: true,
        type: true,
        mediaPriority: true,
        mediaQueueAt: true,
        archivePath: true,
        archiveStatus: true,
        archiveFileCount: true,
        archiveVideoPresent: true,
      },
      orderBy: [{ mediaPriority: 'asc' }, { releaseDate: 'asc' }],
      skip,
      take: pageSize,
    }),
    prisma.stagingSet.count({
      where: {
        mediaQueueAt: { not: null },
        ...(videoFilter !== undefined ? { isVideo: videoFilter } : {}),
      },
    }),
    prisma.set.count({
      where: {
        mediaQueueAt: { not: null },
        ...(videoFilter !== undefined ? { type: videoFilter ? ('video' as const) : { not: 'video' as const } } : {}),
      },
    }),
  ])

  const stagingItems: MediaQueueItem[] = stagingSets.map((ss) => ({
    id: ss.id,
    type: 'staging' as const,
    title: ss.title,
    channelName: ss.channelName,
    releaseDate: ss.releaseDate,
    isVideo: ss.isVideo,
    mediaPriority: ss.mediaPriority ?? 3,
    mediaQueueAt: ss.mediaQueueAt!,
    archivePath: ss.archivePath,
    archiveStatus: ss.archiveStatus,
    archiveFileCount: ss.archiveFileCount,
    archiveVideoPresent: ss.archiveVideoPresent,
  }))

  const setItems: MediaQueueItem[] = sets.map((s) => ({
    id: s.id,
    type: 'set' as const,
    title: s.title,
    channelName: s.channel?.name ?? null,
    releaseDate: s.releaseDate,
    isVideo: s.type === 'video',
    mediaPriority: s.mediaPriority ?? 3,
    mediaQueueAt: s.mediaQueueAt!,
    archivePath: s.archivePath,
    archiveStatus: s.archiveStatus,
    archiveFileCount: s.archiveFileCount,
    archiveVideoPresent: s.archiveVideoPresent,
  }))

  // Merge and re-sort by priority then date
  const items = [...stagingItems, ...setItems].sort((a, b) => {
    if (a.mediaPriority !== b.mediaPriority) return a.mediaPriority - b.mediaPriority
    const da = a.releaseDate?.getTime() ?? 0
    const db = b.releaseDate?.getTime() ?? 0
    return da - db
  })

  return { items, total: stagingTotal + setTotal }
}

export async function toggleStagingSetMediaQueue(
  id: string,
  priority?: number,
): Promise<void> {
  const ss = await prisma.stagingSet.findUnique({
    where: { id },
    select: { mediaQueueAt: true },
  })
  if (!ss) return

  if (ss.mediaQueueAt) {
    await prisma.stagingSet.update({
      where: { id },
      data: { mediaQueueAt: null, mediaPriority: null },
    })
  } else {
    await prisma.stagingSet.update({
      where: { id },
      data: { mediaQueueAt: new Date(), mediaPriority: priority ?? 2 },
    })
  }
}

export async function toggleSetMediaQueue(id: string, priority?: number): Promise<void> {
  const set = await prisma.set.findUnique({
    where: { id },
    select: { mediaQueueAt: true },
  })
  if (!set) return

  if (set.mediaQueueAt) {
    await prisma.set.update({
      where: { id },
      data: { mediaQueueAt: null, mediaPriority: null },
    })
  } else {
    await prisma.set.update({
      where: { id },
      data: { mediaQueueAt: new Date(), mediaPriority: priority ?? 2 },
    })
  }
}

export async function updateStagingSetMediaPriority(id: string, priority: number): Promise<void> {
  await prisma.stagingSet.update({
    where: { id },
    data: { mediaPriority: priority },
  })
}

export async function updateSetMediaPriority(id: string, priority: number): Promise<void> {
  await prisma.set.update({
    where: { id },
    data: { mediaPriority: priority },
  })
}
