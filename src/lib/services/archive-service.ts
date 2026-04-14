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
import type { ArchiveStatus, Prisma } from '@/generated/prisma/client'

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

  /**
   * Derive the folder name from the stored relative path.
   * The video file must be named after its containing folder, so we use
   * the last path segment of the stored archivePath rather than rebuilding
   * from DB fields — this way manually edited paths work correctly.
   * e.g. "FJ-FemJoy\2012\2012-08-08-FJ Jane - Meadow\" → "2012-08-08-FJ Jane - Meadow"
   */
  function folderNameFromPath(relativePath: string): string {
    const trimmed = relativePath.replace(/[/\\]$/, '')
    const segments = trimmed.split(/[/\\]/)
    return segments[segments.length - 1] ?? ''
  }

  const results: ArchivePathEntry[] = []

  for (const ss of stagingSets) {
    if (!ss.archivePath) continue
    const fullPath = toFullPath(ss.archivePath, ss.isVideo)
    if (!fullPath) continue // root not configured — skip
    results.push({
      id: ss.id,
      type: 'staging',
      path: fullPath,
      isVideo: ss.isVideo,
      folderName: folderNameFromPath(ss.archivePath),
    })
  }

  for (const set of sets) {
    if (!set.archivePath) continue
    const isVideo = set.type === 'video'
    const fullPath = toFullPath(set.archivePath, isVideo)
    if (!fullPath) continue
    results.push({
      id: set.id,
      type: 'set',
      path: fullPath,
      isVideo,
      folderName: folderNameFromPath(set.archivePath),
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

// ─── Full-Walk Ingest Types ───────────────────────────────────────────────────

/** Returned by GET /api/archive/folders — used by scan script for preload */
export type ScanPreloadRecord = {
  id: string
  fullPath: string
  contentSignature: string | null
  leafDirModifiedAt: string | null    // ISO string or null
  yearDirModifiedAt: string | null
  chanFolderModifiedAt: string | null
}

export type FullIngestItem = {
  action: 'create' | 'update' | 'rename' | 'unchanged'
  fullPath: string
  previousFullPath?: string           // rename only
  isVideo: boolean
  fileCount: number | null
  videoPresent: boolean | null
  folderName: string
  contentSignature: string
  leafDirModifiedAt: string           // ISO string
  yearDirModifiedAt: string
  chanFolderModifiedAt: string
  parsedDate: string | null           // "YYYY-MM-DD" or null
  parsedShortName: string | null
  parsedTitle: string | null
  nameFormatOk: boolean               // false = folder name deviates from canonical format
}

// ─── Archive Workspace Types ──────────────────────────────────────────────────

export type ArchiveFolderEntry = {
  id: string
  fullPath: string
  relativePath: string | null
  isVideo: boolean
  fileCount: number | null
  videoPresent: boolean | null
  folderName: string
  parsedDate: Date | null
  parsedShortName: string | null
  parsedTitle: string | null
  linkedSetId: string | null
  linkedStagingId: string | null
  suggestedSetId: string | null
  suggestedStagingId: string | null
  /** Title of the suggested match (for display) */
  suggestedSetTitle: string | null
  suggestedStagingTitle: string | null
  scannedAt: Date
  lastRenamedAt: Date | null
  lastRenamedFrom: string | null
  nameFormatOk: boolean
}

export type PhantomEntry = {
  id: string
  type: 'set' | 'staging'
  title: string
  archivePath: string
  archiveStatus: ArchiveStatus
  archiveLastChecked: Date | null
  channelName: string | null
  releaseDate: Date | null
  isVideo: boolean
}

export type UntrackedEntry = {
  id: string
  type: 'set' | 'staging'
  title: string
  channelName: string | null
  releaseDate: Date | null
  isVideo: boolean
}

export type WorkspaceCounts = {
  orphan: number
  linked: number
  phantom: number
  untracked: number
}

export type GroupBy = 'none' | 'channel' | 'year' | 'channelYear'
export type ArchiveSort = 'date' | 'name' | 'fileCount'
export type SortDir = 'asc' | 'desc'

export type WorkspaceFilters = {
  tab: 'orphan' | 'linked' | 'phantom' | 'untracked'
  isVideo?: boolean
  shortName?: string
  year?: number
  hasSuggestion?: boolean
  search?: string
  sort?: ArchiveSort
  sortDir?: SortDir
  groupBy?: GroupBy
  offset?: number
  pageSize?: number
}

export type WorkspacePage = {
  items: ArchiveFolderEntry[] | PhantomEntry[] | UntrackedEntry[]
  total: number
  counts: WorkspaceCounts
  hasMore: boolean
}

// ─── Scan Preload ─────────────────────────────────────────────────────────────

/**
 * Returns all ArchiveFolder records for the current tenant as lightweight
 * preload records — used by the scan script to build its in-memory lookup maps.
 * Cursor-paginated for tenants with > 5,000 folders.
 */
export async function getArchiveFoldersForScan(
  cursor?: string,
  pageSize = 2000,
): Promise<{ records: ScanPreloadRecord[]; nextCursor: string | null }> {
  const rows = await prisma.archiveFolder.findMany({
    take: pageSize,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: 'asc' },
    select: {
      id: true,
      fullPath: true,
      contentSignature: true,
      leafDirModifiedAt: true,
      yearDirModifiedAt: true,
      chanFolderModifiedAt: true,
    },
  })

  const records: ScanPreloadRecord[] = rows.map((r) => ({
    id: r.id,
    fullPath: r.fullPath,
    contentSignature: r.contentSignature,
    leafDirModifiedAt: r.leafDirModifiedAt?.toISOString() ?? null,
    yearDirModifiedAt: r.yearDirModifiedAt?.toISOString() ?? null,
    chanFolderModifiedAt: r.chanFolderModifiedAt?.toISOString() ?? null,
  }))

  return {
    records,
    nextCursor: rows.length === pageSize ? (rows[rows.length - 1]?.id ?? null) : null,
  }
}

// ─── Full-Walk Ingest ─────────────────────────────────────────────────────────

/**
 * Process a batch of smart scan items from a full-walk scan.
 *
 * Action semantics:
 *   create    — new folder, never seen before → insert + run matching
 *   update    — known folder (by fullPath), content changed → update fields, preserve links
 *   rename    — known folder (by previousFullPath), path changed → update path + propagate to linked record
 *   unchanged — mtime identical → only update parent mtime cache fields
 *
 * Returns counts of each action processed.
 */
export async function upsertArchiveFolders(
  items: FullIngestItem[],
  tenant: string,
): Promise<{ created: number; updated: number; renamed: number; unchanged: number }> {
  const now = new Date()
  const counts = { created: 0, updated: 0, renamed: 0, unchanged: 0 }

  for (const item of items) {
    const parsedDate = item.parsedDate ? new Date(item.parsedDate) : null
    const leafDirModifiedAt = new Date(item.leafDirModifiedAt)
    const yearDirModifiedAt = new Date(item.yearDirModifiedAt)
    const chanFolderModifiedAt = new Date(item.chanFolderModifiedAt)

    if (item.action === 'create') {
      await prisma.archiveFolder.create({
        data: {
          fullPath: item.fullPath,
          isVideo: item.isVideo,
          fileCount: item.fileCount,
          videoPresent: item.videoPresent,
          folderName: item.folderName,
          parsedDate,
          parsedShortName: item.parsedShortName,
          parsedTitle: item.parsedTitle,
          nameFormatOk: item.nameFormatOk,
          contentSignature: item.contentSignature,
          leafDirModifiedAt,
          yearDirModifiedAt,
          chanFolderModifiedAt,
          scannedAt: now,
          tenant,
        },
      })
      counts.created++

    } else if (item.action === 'update') {
      await prisma.archiveFolder.update({
        where: { fullPath: item.fullPath },
        data: {
          fileCount: item.fileCount,
          videoPresent: item.videoPresent,
          folderName: item.folderName,
          parsedDate,
          parsedShortName: item.parsedShortName,
          parsedTitle: item.parsedTitle,
          nameFormatOk: item.nameFormatOk,
          contentSignature: item.contentSignature,
          leafDirModifiedAt,
          yearDirModifiedAt,
          chanFolderModifiedAt,
          scannedAt: now,
          // Preserve all link fields
        },
      })
      counts.updated++

    } else if (item.action === 'rename' && item.previousFullPath) {
      // Find existing record by previous path
      const existing = await prisma.archiveFolder.findUnique({
        where: { fullPath: item.previousFullPath },
        select: {
          id: true,
          linkedSetId: true,
          linkedStagingId: true,
          isVideo: true,
          relativePath: true,
        },
      })

      if (existing) {
        // Compute new relative path by stripping root from new fullPath
        const newRelative = await _computeRelativePath(item.fullPath, item.isVideo)

        await prisma.archiveFolder.update({
          where: { id: existing.id },
          data: {
            fullPath: item.fullPath,
            folderName: item.folderName,
            relativePath: newRelative,
            parsedDate,
            parsedShortName: item.parsedShortName,
            parsedTitle: item.parsedTitle,
            nameFormatOk: item.nameFormatOk,
            contentSignature: item.contentSignature,
            fileCount: item.fileCount,
            videoPresent: item.videoPresent,
            leafDirModifiedAt,
            yearDirModifiedAt,
            chanFolderModifiedAt,
            lastRenamedFrom: item.previousFullPath,
            lastRenamedAt: now,
            scannedAt: now,
          },
        })

        // Propagate new relative path to linked Set/StagingSet so archivePath stays current
        if (newRelative) {
          if (existing.linkedSetId) {
            await prisma.set.update({
              where: { id: existing.linkedSetId },
              data: { archivePath: newRelative, archiveStatus: 'PENDING' },
            })
          }
          if (existing.linkedStagingId) {
            await prisma.stagingSet.update({
              where: { id: existing.linkedStagingId },
              data: { archivePath: newRelative, archiveStatus: 'PENDING' },
            })
          }
        }

        counts.renamed++
      } else {
        // Fallback: previous path not found, treat as create
        await prisma.archiveFolder.upsert({
          where: { fullPath: item.fullPath },
          create: {
            fullPath: item.fullPath,
            isVideo: item.isVideo,
            fileCount: item.fileCount,
            videoPresent: item.videoPresent,
            folderName: item.folderName,
            parsedDate,
            parsedShortName: item.parsedShortName,
            parsedTitle: item.parsedTitle,
            nameFormatOk: item.nameFormatOk,
            contentSignature: item.contentSignature,
            leafDirModifiedAt,
            yearDirModifiedAt,
            chanFolderModifiedAt,
            scannedAt: now,
            tenant,
          },
          update: {
            contentSignature: item.contentSignature,
            leafDirModifiedAt,
            yearDirModifiedAt,
            chanFolderModifiedAt,
            scannedAt: now,
          },
        })
        counts.created++
      }

    } else if (item.action === 'unchanged') {
      // Update parent mtime cache + parsed fields (backfills if regex improved) + nameFormatOk
      await prisma.archiveFolder.update({
        where: { fullPath: item.fullPath },
        data: {
          yearDirModifiedAt,
          chanFolderModifiedAt,
          scannedAt: now,
          parsedDate,
          parsedShortName: item.parsedShortName,
          parsedTitle: item.parsedTitle,
          nameFormatOk: item.nameFormatOk,
        },
      })
      counts.unchanged++
    }
  }

  return counts
}

/**
 * Strip the configured archive root from a full filesystem path to get the
 * relative path stored in the DB. Returns null if root is not configured.
 */
async function _computeRelativePath(fullPath: string, isVideo: boolean): Promise<string | null> {
  const rootKey = isVideo ? ARCHIVE_VIDEOSET_ROOT_KEY : ARCHIVE_PHOTOSET_ROOT_KEY
  const root = await getSetting(rootKey)
  if (!root) return null
  const normRoot = root.replace(/[/\\]$/, '')
  if (!fullPath.toLowerCase().startsWith(normRoot.toLowerCase())) return null
  return fullPath.slice(normRoot.length).replace(/^[/\\]/, '')
}

/**
 * After upserting ArchiveFolder records, run the matching pass:
 * 1. Compute relativePath for each folder (strip known roots)
 * 2. Try exact archivePath match → set linkedSetId / linkedStagingId
 * 3. Try parsedDate + parsedShortName → set suggestedSetId / suggestedStagingId
 *
 * Only processes unlinked folders (linkedSetId IS NULL AND linkedStagingId IS NULL).
 */
export async function runMatchingPass(
  tenant: string,
): Promise<{ linked: number; suggested: number }> {
  const [photoRoot, videoRoot] = await Promise.all([
    getSetting(ARCHIVE_PHOTOSET_ROOT_KEY),
    getSetting(ARCHIVE_VIDEOSET_ROOT_KEY),
  ])

  // Load all unlinked folders for this tenant
  const folders = await prisma.archiveFolder.findMany({
    where: {
      tenant,
      linkedSetId: null,
      linkedStagingId: null,
    },
    select: {
      id: true,
      fullPath: true,
      isVideo: true,
      folderName: true,
      parsedDate: true,
      parsedShortName: true,
      parsedTitle: true,
      relativePath: true,
    },
  })

  // Build relative path lookup sets from DB records for fast matching
  const stagingPaths = await prisma.stagingSet.findMany({
    where: { archivePath: { not: null } },
    select: { id: true, archivePath: true, isVideo: true },
  })
  const setPaths = await prisma.set.findMany({
    where: { archivePath: { not: null } },
    select: { id: true, archivePath: true, type: true },
  })

  // Index by normalised relative path (lowercase, forward slashes, no trailing slash)
  const stagingByPath = new Map(
    stagingPaths.map((s) => [_normPath(s.archivePath!), s.id]),
  )
  const setByPath = new Map(
    setPaths.map((s) => [_normPath(s.archivePath!), s.id]),
  )

  let linked = 0
  let suggested = 0

  for (const folder of folders) {
    // Compute relativePath from fullPath by stripping the known root
    const root = folder.isVideo ? videoRoot : photoRoot
    let relativePath = folder.relativePath
    if (!relativePath && root) {
      const normRoot = root.replace(/[/\\]$/, '')
      if (folder.fullPath.toLowerCase().startsWith(normRoot.toLowerCase())) {
        relativePath = folder.fullPath.slice(normRoot.length).replace(/^[/\\]/, '')
        await prisma.archiveFolder.update({
          where: { id: folder.id },
          data: { relativePath },
        })
      }
    }

    // Step 1: exact path match
    const normRelative = relativePath ? _normPath(relativePath) : null
    if (normRelative) {
      const stagingId = stagingByPath.get(normRelative)
      const setId = setByPath.get(normRelative)
      if (stagingId) {
        await prisma.archiveFolder.update({
          where: { id: folder.id },
          data: { linkedStagingId: stagingId },
        })
        linked++
        continue
      }
      if (setId) {
        await prisma.archiveFolder.update({
          where: { id: folder.id },
          data: { linkedSetId: setId },
        })
        linked++
        continue
      }
    }

    // Step 2: parsedDate + parsedShortName → suggestion
    if (folder.parsedDate && folder.parsedShortName) {
      const dateStart = new Date(folder.parsedDate)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(dateStart)
      dateEnd.setDate(dateEnd.getDate() + 1)

      // Try staging sets first
      const stagingSuggestions = await prisma.stagingSet.findMany({
        where: {
          releaseDate: { gte: dateStart, lt: dateEnd },
          channel: { shortName: { equals: folder.parsedShortName, mode: 'insensitive' } },
          archivePath: null, // only suggest unlinked sets
        },
        select: { id: true },
        take: 1,
      })
      if (stagingSuggestions.length > 0) {
        await prisma.archiveFolder.update({
          where: { id: folder.id },
          data: { suggestedStagingId: stagingSuggestions[0].id },
        })
        suggested++
        continue
      }

      // Try promoted sets
      const setSuggestions = await prisma.set.findMany({
        where: {
          releaseDate: { gte: dateStart, lt: dateEnd },
          channel: { shortName: { equals: folder.parsedShortName, mode: 'insensitive' } },
          archivePath: null,
        },
        select: { id: true },
        take: 1,
      })
      if (setSuggestions.length > 0) {
        await prisma.archiveFolder.update({
          where: { id: folder.id },
          data: { suggestedSetId: setSuggestions[0].id },
        })
        suggested++
      }
    }
  }

  return { linked, suggested }
}

function _normPath(p: string): string {
  return p.replace(/[/\\]+/g, '/').replace(/\/$/, '').toLowerCase()
}

// ─── Archive Workspace Queries ────────────────────────────────────────────────

/**
 * Returns tab counts + paginated items for the /archive workspace page.
 */
export async function getArchiveWorkspace(filters: WorkspaceFilters): Promise<WorkspacePage> {
  const pageSize = filters.pageSize ?? 200
  const offset = filters.offset ?? 0

  // Always compute all tab counts together
  const [orphanCount, linkedCount, phantomCount, untrackedCount] = await Promise.all([
    prisma.archiveFolder.count({ where: { linkedSetId: null, linkedStagingId: null } }),
    prisma.archiveFolder.count({
      where: { OR: [{ linkedSetId: { not: null } }, { linkedStagingId: { not: null } }] },
    }),
    Promise.all([
      prisma.set.count({ where: { archiveStatus: 'MISSING' } }),
      prisma.stagingSet.count({ where: { archiveStatus: 'MISSING' } }),
    ]).then(([a, b]) => a + b),
    Promise.all([
      prisma.set.count({ where: { archiveStatus: 'UNKNOWN' } }),
      prisma.stagingSet.count({ where: { archiveStatus: 'UNKNOWN' } }),
    ]).then(([a, b]) => a + b),
  ])

  const counts: WorkspaceCounts = {
    orphan: orphanCount,
    linked: linkedCount,
    phantom: phantomCount,
    untracked: untrackedCount,
  }

  // Build orderBy for archive folder tabs based on groupBy + sort preferences
  function buildOrderBy(groupBy: GroupBy | undefined, sort: ArchiveSort | undefined, sortDir: SortDir | undefined) {
    const dir = sortDir ?? 'desc'
    const channelFirst = [
      { parsedShortName: 'asc' as const },
      { parsedDate: 'desc' as const },
      { folderName: 'asc' as const },
    ]
    if (groupBy === 'channel' || groupBy === 'channelYear') return channelFirst
    if (groupBy === 'year') return [
      { parsedDate: dir },
      { parsedShortName: 'asc' as const },
      { folderName: 'asc' as const },
    ]
    // groupBy = none: user-selected sort
    if (sort === 'name') return [{ folderName: dir }, { parsedDate: 'desc' as const }]
    if (sort === 'fileCount') return [{ fileCount: dir }, { parsedDate: 'desc' as const }]
    return [{ parsedDate: dir }, { folderName: 'asc' as const }]
  }

  const folderSelect = {
    id: true,
    fullPath: true,
    relativePath: true,
    isVideo: true,
    fileCount: true,
    videoPresent: true,
    folderName: true,
    parsedDate: true,
    parsedShortName: true,
    parsedTitle: true,
    linkedSetId: true,
    linkedStagingId: true,
    suggestedSetId: true,
    suggestedStagingId: true,
    scannedAt: true,
    lastRenamedAt: true,
    lastRenamedFrom: true,
    nameFormatOk: true,
  }

  if (filters.tab === 'orphan') {
    const where = {
      linkedSetId: null,
      linkedStagingId: null,
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
      ...(filters.shortName ? { parsedShortName: { equals: filters.shortName, mode: 'insensitive' as const } } : {}),
      ...(filters.year ? {
        parsedDate: {
          gte: new Date(`${filters.year}-01-01`),
          lt: new Date(`${filters.year + 1}-01-01`),
        },
      } : {}),
      ...(filters.hasSuggestion ? {
        OR: [{ suggestedSetId: { not: null } }, { suggestedStagingId: { not: null } }],
      } : {}),
      ...(filters.search ? {
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' as const } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    }

    const [total, rows] = await Promise.all([
      prisma.archiveFolder.count({ where }),
      prisma.archiveFolder.findMany({
        where,
        orderBy: buildOrderBy(filters.groupBy, filters.sort, filters.sortDir),
        take: pageSize,
        skip: offset,
        select: folderSelect,
      }),
    ])

    // Fetch suggested set titles for display
    const suggestedSetIds = rows.map((r) => r.suggestedSetId).filter(Boolean) as string[]
    const suggestedStagingIds = rows.map((r) => r.suggestedStagingId).filter(Boolean) as string[]
    const [suggestedSets, suggestedStagings] = await Promise.all([
      suggestedSetIds.length > 0
        ? prisma.set.findMany({ where: { id: { in: suggestedSetIds } }, select: { id: true, title: true } })
        : [],
      suggestedStagingIds.length > 0
        ? prisma.stagingSet.findMany({ where: { id: { in: suggestedStagingIds } }, select: { id: true, title: true } })
        : [],
    ])
    const setTitleMap = new Map(suggestedSets.map((s) => [s.id, s.title]))
    const stagingTitleMap = new Map(suggestedStagings.map((s) => [s.id, s.title]))

    const items: ArchiveFolderEntry[] = rows.map((r) => ({
      ...r,
      suggestedSetTitle: r.suggestedSetId ? (setTitleMap.get(r.suggestedSetId) ?? null) : null,
      suggestedStagingTitle: r.suggestedStagingId ? (stagingTitleMap.get(r.suggestedStagingId) ?? null) : null,
    }))

    return { items, total, counts, hasMore: rows.length === pageSize }
  }

  if (filters.tab === 'linked') {
    const where = {
      OR: [{ linkedSetId: { not: null } }, { linkedStagingId: { not: null } }],
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
      ...(filters.shortName ? { parsedShortName: { equals: filters.shortName, mode: 'insensitive' as const } } : {}),
      ...(filters.year ? {
        parsedDate: {
          gte: new Date(`${filters.year}-01-01`),
          lt: new Date(`${filters.year + 1}-01-01`),
        },
      } : {}),
      ...(filters.search ? {
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' as const } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    }

    const [total, rows] = await Promise.all([
      prisma.archiveFolder.count({ where }),
      prisma.archiveFolder.findMany({
        where,
        orderBy: buildOrderBy(filters.groupBy, filters.sort, filters.sortDir),
        take: pageSize,
        skip: offset,
        select: folderSelect,
      }),
    ])

    const items: ArchiveFolderEntry[] = rows.map((r) => ({
      ...r,
      suggestedSetTitle: null,
      suggestedStagingTitle: null,
    }))

    return { items, total, counts, hasMore: rows.length === pageSize }
  }

  if (filters.tab === 'phantom') {
    const videoWhere = filters.isVideo !== undefined
      ? (filters.isVideo ? ({ type: 'video' as const }) : ({ type: { not: 'video' as const } }))
      : {}

    const [sets, stagings, setTotal, stagingTotal] = await Promise.all([
      prisma.set.findMany({
        where: { archiveStatus: 'MISSING', ...videoWhere },
        select: {
          id: true, title: true, archivePath: true, archiveStatus: true,
          archiveLastChecked: true, releaseDate: true, type: true,
          channel: { select: { name: true } },
        },
        orderBy: { archiveLastChecked: 'desc' },
        take: pageSize,
        skip: offset,
      }),
      prisma.stagingSet.findMany({
        where: { archiveStatus: 'MISSING', ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}) },
        select: {
          id: true, title: true, archivePath: true, archiveStatus: true,
          archiveLastChecked: true, releaseDate: true, isVideo: true, channelName: true,
        },
        orderBy: { archiveLastChecked: 'desc' },
        take: pageSize,
        skip: offset,
      }),
      prisma.set.count({ where: { archiveStatus: 'MISSING', ...videoWhere } }),
      prisma.stagingSet.count({ where: { archiveStatus: 'MISSING', ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}) } }),
    ])

    const items: PhantomEntry[] = [
      ...sets.map((s) => ({
        id: s.id, type: 'set' as const, title: s.title,
        archivePath: s.archivePath!, archiveStatus: s.archiveStatus,
        archiveLastChecked: s.archiveLastChecked, channelName: s.channel?.name ?? null,
        releaseDate: s.releaseDate, isVideo: s.type === 'video',
      })),
      ...stagings.map((s) => ({
        id: s.id, type: 'staging' as const, title: s.title,
        archivePath: s.archivePath!, archiveStatus: s.archiveStatus,
        archiveLastChecked: s.archiveLastChecked, channelName: s.channelName,
        releaseDate: s.releaseDate, isVideo: s.isVideo,
      })),
    ].sort((a, b) => (b.archiveLastChecked?.getTime() ?? 0) - (a.archiveLastChecked?.getTime() ?? 0))

    return { items, total: setTotal + stagingTotal, counts, hasMore: false }
  }

  // tab === 'untracked'
  const videoWhere = filters.isVideo !== undefined
    ? (filters.isVideo ? ({ type: 'video' as const }) : ({ type: { not: 'video' as const } }))
    : {}

  const [sets, stagings, setTotal, stagingTotal] = await Promise.all([
    prisma.set.findMany({
      where: { archiveStatus: 'UNKNOWN', ...videoWhere },
      select: { id: true, title: true, releaseDate: true, type: true, channel: { select: { name: true } } },
      orderBy: { releaseDate: 'desc' },
      take: pageSize,
      skip: offset,
    }),
    prisma.stagingSet.findMany({
      where: { archiveStatus: 'UNKNOWN', ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}) },
      select: { id: true, title: true, releaseDate: true, isVideo: true, channelName: true },
      orderBy: { releaseDate: 'desc' },
      take: pageSize,
      skip: offset,
    }),
    prisma.set.count({ where: { archiveStatus: 'UNKNOWN', ...videoWhere } }),
    prisma.stagingSet.count({ where: { archiveStatus: 'UNKNOWN', ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}) } }),
  ])

  const items: UntrackedEntry[] = [
    ...sets.map((s) => ({
      id: s.id, type: 'set' as const, title: s.title,
      channelName: s.channel?.name ?? null, releaseDate: s.releaseDate, isVideo: s.type === 'video',
    })),
    ...stagings.map((s) => ({
      id: s.id, type: 'staging' as const, title: s.title,
      channelName: s.channelName, releaseDate: s.releaseDate, isVideo: s.isVideo,
    })),
  ].sort((a, b) => (b.releaseDate?.getTime() ?? 0) - (a.releaseDate?.getTime() ?? 0))

  return { items, total: setTotal + stagingTotal, counts, hasMore: false }
}

// ─── Workspace Actions ────────────────────────────────────────────────────────

/**
 * Confirm a suggested (or manually chosen) link between an ArchiveFolder and a DB set.
 * Sets the linkedSetId/linkedStagingId and writes the archivePath back to the set.
 */
export async function confirmArchiveFolderLink(
  folderId: string,
  setId: string,
  type: 'set' | 'staging',
): Promise<void> {
  const folder = await prisma.archiveFolder.findUnique({ where: { id: folderId } })
  if (!folder) return

  if (type === 'set') {
    await prisma.archiveFolder.update({
      where: { id: folderId },
      data: { linkedSetId: setId, suggestedSetId: null },
    })
    if (folder.relativePath) {
      await prisma.set.update({
        where: { id: setId },
        data: { archivePath: folder.relativePath, archiveStatus: 'PENDING' },
      })
    }
  } else {
    await prisma.archiveFolder.update({
      where: { id: folderId },
      data: { linkedStagingId: setId, suggestedStagingId: null },
    })
    if (folder.relativePath) {
      await prisma.stagingSet.update({
        where: { id: setId },
        data: { archivePath: folder.relativePath, archiveStatus: 'PENDING' },
      })
    }
  }
}

/**
 * Dismiss a suggestion — folder remains as an orphan.
 */
export async function rejectArchiveSuggestion(folderId: string): Promise<void> {
  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { suggestedSetId: null, suggestedStagingId: null },
  })
}

/**
 * Create a minimal StagingSet from an orphan ArchiveFolder.
 * Pre-populates title (folder name), channelName (parsed short name), releaseDate,
 * and archivePath from the folder's data.
 */
export async function createStagingSetFromOrphan(
  folderId: string,
): Promise<{ stagingSetId: string }> {
  const folder = await prisma.archiveFolder.findUnique({ where: { id: folderId } })
  if (!folder) throw new Error('Archive folder not found')

  // Try to find the channel by short name to populate channelName properly
  let channelName = folder.parsedShortName ?? 'Unknown'
  let channelId: string | null = null
  if (folder.parsedShortName) {
    const channel = await prisma.channel.findFirst({
      where: { shortName: { equals: folder.parsedShortName, mode: 'insensitive' } },
      select: { id: true, name: true },
    })
    if (channel) {
      channelName = channel.name
      channelId = channel.id
    }
  }

  const createData: Prisma.StagingSetUncheckedCreateInput = {
    title: folder.parsedTitle ?? folder.folderName,
    channelName,
    channelId: channelId ?? null,
    releaseDate: folder.parsedDate ?? undefined,
    isVideo: folder.isVideo,
    archivePath: folder.relativePath ?? undefined,
    archiveStatus: folder.relativePath ? 'PENDING' : 'UNKNOWN',
  }

  const stagingSet = await prisma.stagingSet.create({
    data: createData,
    select: { id: true },
  })

  // Link the folder to the new staging set
  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { linkedStagingId: stagingSet.id },
  })

  return { stagingSetId: stagingSet.id }
}

// ─── Folder Name Re-parse ─────────────────────────────────────────────────────

/**
 * Parse a folder name using the same multi-pattern logic as the scan script.
 * Returns parsedDate ("YYYY-MM-DD"), parsedShortName, parsedTitle, nameFormatOk.
 */
function parseFolderName(name: string): {
  parsedDate: Date | null
  parsedShortName: string | null
  parsedTitle: string | null
  nameFormatOk: boolean
} {
  // Pattern 1 — canonical: space + [-–—] + space (exact format)
  let m = name.match(/^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)\s+[-–—]\s+(.+)$/)
  if (m) return { parsedDate: new Date(m[1]), parsedShortName: m[2], parsedTitle: m[4], nameFormatOk: true }

  // Pattern 2 — "Name -Title" (space before separator, no space after)
  m = name.match(/^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)\s+[-–—](\S.*)$/)
  if (m) return { parsedDate: new Date(m[1]), parsedShortName: m[2], parsedTitle: m[4].trimStart(), nameFormatOk: false }

  // Pattern 3 — "Name- Title" (no space before separator, space after)
  m = name.match(/^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+?)[-–—]\s+(.+)$/)
  if (m) return { parsedDate: new Date(m[1]), parsedShortName: m[2], parsedTitle: m[4], nameFormatOk: false }

  // Pattern 4 — no separator at all
  m = name.match(/^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)\s+(.+)$/)
  if (m) return { parsedDate: new Date(m[1]), parsedShortName: m[2], parsedTitle: m[3], nameFormatOk: false }

  // No pattern matched — cannot extract date or short name
  return { parsedDate: null, parsedShortName: null, parsedTitle: null, nameFormatOk: false }
}

/**
 * Re-parse all ArchiveFolders whose nameFormatOk=false or parsedShortName=null,
 * updating parsedDate, parsedShortName, parsedTitle, nameFormatOk directly.
 * This is a one-shot backfill that runs entirely in the DB — no scan required.
 */
export async function reparseFolderNames(tenant: string): Promise<{ updated: number }> {
  const folders = await prisma.archiveFolder.findMany({
    where: {
      tenant,
      OR: [{ parsedShortName: null }, { nameFormatOk: false }],
    },
    select: { id: true, folderName: true },
  })

  let updated = 0
  for (const folder of folders) {
    const parsed = parseFolderName(folder.folderName)
    await prisma.archiveFolder.update({
      where: { id: folder.id },
      data: {
        parsedDate: parsed.parsedDate,
        parsedShortName: parsed.parsedShortName,
        parsedTitle: parsed.parsedTitle,
        nameFormatOk: parsed.nameFormatOk,
      },
    })
    updated++
  }

  return { updated }
}
