/**
 * Archive service — manages physical media archive path tracking
 * and the media queue for both StagingSet and Set records.
 *
 * The archive path points to the physical folder on the local filesystem
 * (e.g. x:\Sites\MA-MySite\2012\2012-08-08-MA Jane - Waterworld\).
 * A separate scan script reads the filesystem and calls ingestScanResults()
 * via the /api/archive/ingest API route.
 */

import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/services/setting-service'
import { ArchiveLinkStatus } from '@/generated/prisma/client'
import type { ArchiveStatus, Prisma } from '@/generated/prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

export const ARCHIVE_PHOTOSET_ROOT_KEY = 'archive.photosetRoot'
export const ARCHIVE_VIDEOSET_ROOT_KEY = 'archive.videosetRoot'
export const ARCHIVE_LAST_SCAN_KEY = 'archive.lastScan'
export const ARCHIVE_LAST_SCAN_SUMMARY_KEY = 'archive.lastScanSummary'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArchivePathEntry = {
  archiveLinkId: string
  path: string
  isVideo: boolean
  /** The expected video file name (without extension) for videosets */
  folderName: string
  /** Previously confirmed video filename — scan should respect this choice */
  confirmedVideoFilename: string | null
}

export type ScanResult = {
  archiveLinkId: string
  path: string
  exists: boolean
  fileCount: number | null
  videoPresent: boolean | null
  /** All video files found in the folder root (basenames with extension) */
  videoFiles: string[] | null
  error: string | null
}

export type ArchiveSuggestion = {
  folderId: string
  folderName: string
  fileCount: number | null
  confidence: 'HIGH' | 'MEDIUM'
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
  /** Non-null when an ArchiveFolder has been suggested but not yet confirmed */
  archiveSuggestion: ArchiveSuggestion | null
}

// Silence unused import warning — ArchiveLinkStatus is re-exported for callers
export type { ArchiveLinkStatus }

// ─── Multi-root helpers ───────────────────────────────────────────────────────

/**
 * Parse an archive root setting value into a list of root paths.
 * Supports both legacy single-string format ("D:\\Sites\\") and
 * new JSON array format (["D:\\Sites\\","E:\\Sites\\"]).
 */
export function parseRoots(value: string | null): string[] {
  if (!value) return []
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
    } catch {
      // fall through to legacy
    }
  }
  return [trimmed]
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
 * Uses the first configured root. Returns null if no roots are configured.
 */
export async function buildFullPath(relativePath: string, isVideo: boolean): Promise<string | null> {
  const rootKey = isVideo ? ARCHIVE_VIDEOSET_ROOT_KEY : ARCHIVE_PHOTOSET_ROOT_KEY
  const rawRoots = await getSetting(rootKey)
  const roots = parseRoots(rawRoots)
  if (roots.length === 0) return null
  const root = roots[0]!
  const sep = root.includes('/') ? '/' : '\\'
  return root.replace(/[/\\]$/, '') + sep + relativePath
}

/**
 * Build all full paths from a relative path by trying every configured root.
 * Returns one entry per configured root.
 */
export async function buildFullPaths(relativePath: string, isVideo: boolean): Promise<string[]> {
  const rootKey = isVideo ? ARCHIVE_VIDEOSET_ROOT_KEY : ARCHIVE_PHOTOSET_ROOT_KEY
  const rawRoots = await getSetting(rootKey)
  const roots = parseRoots(rawRoots)
  return roots.map((root) => {
    const sep = root.includes('/') ? '/' : '\\'
    return root.replace(/[/\\]$/, '') + sep + relativePath
  })
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

// ─── Archive Link Management ──────────────────────────────────────────────────

/**
 * Remove all ArchiveLinks for a given folder (confirmed or suggested).
 */
export async function unlinkArchiveFolder(folderId: string): Promise<void> {
  await prisma.archiveLink.deleteMany({ where: { archiveFolderId: folderId } })
}

/**
 * Confirm a specific video file as the correct one for a videoset.
 * Sets archiveVideoPresent=true, archiveVideoFilename=filename, archiveStatus=OK.
 * The filename is persisted so future scans respect the user's choice (as long
 * as the file is still on disk at the time of the next scan).
 */
export async function confirmVideoFile(
  archiveLinkId: string,
  filename: string,
): Promise<void> {
  const link = await prisma.archiveLink.findUnique({
    where: { id: archiveLinkId },
    select: { setId: true, stagingSetId: true },
  })
  if (!link) return
  await prisma.archiveLink.update({
    where: { id: archiveLinkId },
    data: { archiveVideoPresent: true, archiveVideoFilename: filename, archiveStatus: 'OK' },
  })
  // Clear media queue on the linked entity
  if (link.setId) {
    await prisma.set.update({ where: { id: link.setId }, data: { mediaQueueAt: null, mediaPriority: null } })
  } else if (link.stagingSetId) {
    await prisma.stagingSet.update({ where: { id: link.stagingSetId }, data: { mediaQueueAt: null, mediaPriority: null } })
  }
}

// ─── Scan API Support ─────────────────────────────────────────────────────────

/**
 * Returns all CONFIRMED ArchiveLinks with a recorded archivePath, for the scan script.
 * The `path` field is the FULL filesystem path (root + relative) reconstructed
 * from current Settings. Entries whose root is not configured are excluded.
 */
export async function getArchivePaths(): Promise<ArchivePathEntry[]> {
  const [rawPhotoRoots, rawVideoRoots, links] = await Promise.all([
    getSetting(ARCHIVE_PHOTOSET_ROOT_KEY),
    getSetting(ARCHIVE_VIDEOSET_ROOT_KEY),
    prisma.archiveLink.findMany({
      where: { status: 'CONFIRMED', archivePath: { not: null } },
      select: {
        id: true,
        archivePath: true,
        archiveVideoFilename: true,
        archiveFolder: { select: { isVideo: true, folderName: true } },
      },
    }),
  ])

  const photoRoots = parseRoots(rawPhotoRoots)
  const videoRoots = parseRoots(rawVideoRoots)

  function toFullPath(relativePath: string, isVideo: boolean): string | null {
    const roots = isVideo ? videoRoots : photoRoots
    if (roots.length === 0) return null
    const root = roots[0]!
    const sep = root.includes('/') ? '/' : '\\'
    return root.replace(/[/\\]$/, '') + sep + relativePath
  }

  function folderNameFromPath(relativePath: string): string {
    const trimmed = relativePath.replace(/[/\\]$/, '')
    const segments = trimmed.split(/[/\\]/)
    return segments[segments.length - 1] ?? ''
  }

  const results: ArchivePathEntry[] = []
  for (const link of links) {
    if (!link.archivePath) continue
    const isVideo = link.archiveFolder.isVideo
    const fullPath = toFullPath(link.archivePath, isVideo)
    if (!fullPath) continue
    results.push({
      archiveLinkId: link.id,
      path: fullPath,
      isVideo,
      folderName: folderNameFromPath(link.archivePath),
      confirmedVideoFilename: link.archiveVideoFilename ?? null,
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

    const current = await prisma.archiveLink.findUnique({
      where: { id: r.archiveLinkId },
      select: { archiveFileCount: true, archiveVideoFilename: true, setId: true, stagingSetId: true },
    })
    if (!current) continue

    const prevCount = current.archiveFileCount ?? null
    const derivedStatus: ArchiveStatus =
      status === 'OK' && prevCount !== null && r.fileCount !== null && r.fileCount !== prevCount
        ? 'CHANGED'
        : status
    if (derivedStatus === 'CHANGED') { counts.changed++; counts.ok-- }

    const { videoPresent, videoFilename } = _resolveVideoPresence(r, current.archiveVideoFilename ?? null)
    const clearQueue = ['OK', 'CHANGED'].includes(derivedStatus)

    await prisma.archiveLink.update({
      where: { id: r.archiveLinkId },
      data: {
        archiveStatus: derivedStatus,
        archiveLastChecked: now,
        archiveFileCount: r.fileCount,
        archiveFileCountPrev: prevCount,
        archiveVideoPresent: videoPresent,
        archiveVideoFiles: r.videoFiles != null ? JSON.stringify(r.videoFiles) : undefined,
        archiveVideoFilename: videoFilename,
        ...(derivedStatus === 'OK' ? { lastVerifiedAt: now } : {}),
      },
    })

    if (clearQueue) {
      if (current.setId) {
        await prisma.set.update({ where: { id: current.setId }, data: { mediaQueueAt: null, mediaPriority: null } })
      } else if (current.stagingSetId) {
        await prisma.stagingSet.update({ where: { id: current.stagingSetId }, data: { mediaQueueAt: null, mediaPriority: null } })
      }
    }
  }

  // Record last scan timestamp and summary
  const summary = `${results.length} checked — OK: ${counts.ok}, Changed: ${counts.changed}, Missing: ${counts.missing}, Incomplete: ${counts.incomplete}${counts.errors > 0 ? `, Errors: ${counts.errors}` : ''}`
  await setSetting(ARCHIVE_LAST_SCAN_KEY, now.toISOString())
  await setSetting(ARCHIVE_LAST_SCAN_SUMMARY_KEY, summary)
}

function _deriveStatus(r: ScanResult): ArchiveStatus {
  if (r.error || !r.exists) return 'MISSING'
  // videoPresent=false (no match) OR null (files found but no auto-match and no confirmation) → INCOMPLETE
  if (r.videoPresent === false || r.videoPresent === null && r.videoFiles != null) return 'INCOMPLETE'
  return 'OK'
  // Note: CHANGED is set separately after comparing prev/current counts in the update
}

/**
 * Resolve the effective videoPresent flag and filename for a scan result,
 * taking into account any previously confirmed filename.
 *
 * Rules:
 * - If scan already found a confirmed exact match (videoPresent=true): keep it, auto-detect filename
 * - If a confirmedFilename is stored and that file is still in videoFiles: override to present=true
 * - If a confirmedFilename is stored but the file is gone: reset confirmation (return null filename)
 * - Otherwise: use raw videoPresent from scan
 */
function _resolveVideoPresence(
  r: ScanResult,
  storedConfirmed: string | null,
): { videoPresent: boolean | null; videoFilename: string | null } {
  if (!r.exists) return { videoPresent: null, videoFilename: null }

  const files = r.videoFiles ?? []

  // If scan detected an exact name match, auto-fill the filename
  if (r.videoPresent === true) {
    // Find which file matched (scan computed it, but didn't tell us which — derive from folderName)
    // The auto-matched filename is already in videoFiles: just return videoPresent=true, filename=stored or auto
    // If there's a stored confirmed name that's still present, keep it; else keep null (PS1 auto-matched)
    const confirmedStillPresent = storedConfirmed && files.includes(storedConfirmed)
    return { videoPresent: true, videoFilename: confirmedStillPresent ? storedConfirmed : (storedConfirmed ?? null) }
  }

  // No exact auto-match — check if a previously confirmed filename is still on disk
  if (storedConfirmed) {
    if (files.includes(storedConfirmed)) {
      // Confirmed file still present
      return { videoPresent: true, videoFilename: storedConfirmed }
    }
    // Confirmed file disappeared — reset
    return { videoPresent: false, videoFilename: null }
  }

  // No confirmation, no auto-match
  return { videoPresent: r.videoPresent, videoFilename: null }
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

  // Fetch CONFIRMED archive links for all returned IDs
  const [stagingLinks, setLinks] = await Promise.all([
    prisma.archiveLink.findMany({
      where: { stagingSetId: { in: stagingSets.map((s) => s.id) }, status: 'CONFIRMED' },
      select: { stagingSetId: true, archivePath: true, archiveStatus: true, archiveFileCount: true, archiveVideoPresent: true, archiveFolder: { select: { id: true } } },
    }),
    prisma.archiveLink.findMany({
      where: { setId: { in: sets.map((s) => s.id) }, status: 'CONFIRMED' },
      select: { setId: true, archivePath: true, archiveStatus: true, archiveFileCount: true, archiveVideoPresent: true, archiveFolder: { select: { id: true } } },
    }),
  ])
  const stagingLinkMap = new Map(stagingLinks.map((l) => [l.stagingSetId!, l]))
  const setLinkMap = new Map(setLinks.map((l) => [l.setId!, l]))

  // Fetch pending archive suggestions for all items in one pass
  const [stagingSuggestions, setSuggestions] = await Promise.all([
    getSuggestedFoldersForStagingSets(stagingSets.map((s) => s.id)),
    getSuggestedFoldersForSets(sets.map((s) => s.id)),
  ])

  const stagingItems: MediaQueueItem[] = stagingSets.map((ss) => {
    const link = stagingLinkMap.get(ss.id)
    const sug = stagingSuggestions.get(ss.id)
    return {
      id: ss.id,
      type: 'staging' as const,
      title: ss.title,
      channelName: ss.channelName,
      releaseDate: ss.releaseDate,
      isVideo: ss.isVideo,
      mediaPriority: ss.mediaPriority ?? 3,
      mediaQueueAt: ss.mediaQueueAt!,
      archivePath: link?.archivePath ?? null,
      archiveStatus: link?.archiveStatus ?? 'UNKNOWN',
      archiveFileCount: link?.archiveFileCount ?? null,
      archiveVideoPresent: link?.archiveVideoPresent ?? null,
      archiveSuggestion: sug
        ? { folderId: sug.folderId, folderName: sug.folderName, fileCount: sug.fileCount, confidence: sug.confidence }
        : null,
    }
  })

  const setItems: MediaQueueItem[] = sets.map((s) => {
    const link = setLinkMap.get(s.id)
    const sug = setSuggestions.get(s.id)
    return {
      id: s.id,
      type: 'set' as const,
      title: s.title,
      channelName: s.channel?.name ?? null,
      releaseDate: s.releaseDate,
      isVideo: s.type === 'video',
      mediaPriority: s.mediaPriority ?? 3,
      mediaQueueAt: s.mediaQueueAt!,
      archivePath: link?.archivePath ?? null,
      archiveStatus: link?.archiveStatus ?? 'UNKNOWN',
      archiveFileCount: link?.archiveFileCount ?? null,
      archiveVideoPresent: link?.archiveVideoPresent ?? null,
      archiveSuggestion: sug
        ? { folderId: sug.folderId, folderName: sug.folderName, fileCount: sug.fileCount, confidence: sug.confidence }
        : null,
    }
  })

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
  archiveKey: string                   // stable UUID; generated at first scan time (always present)
}

export type FullIngestItem = {
  action: 'create' | 'update' | 'rename' | 'unchanged'
  fullPath: string
  previousFullPath?: string           // rename only
  isVideo: boolean
  fileCount: number | null
  videoPresent: boolean | null
  /** All video files found in the folder root (basenames with extension) */
  videoFiles: string[] | null
  folderName: string
  contentSignature: string
  leafDirModifiedAt: string           // ISO string
  yearDirModifiedAt: string
  chanFolderModifiedAt: string
  parsedDate: string | null           // "YYYY-MM-DD" or null
  parsedShortName: string | null
  parsedTitle: string | null
  nameFormatOk: boolean               // false = folder name deviates from canonical format
  chanFolderName: string | null       // channel folder name (e.g. "RA-RylskyArt")
  sidecarKey?: string                 // contents of _pulseboard.json archiveKey field, if present
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
  /** Display fields for the suggested match */
  suggestedSetTitle: string | null
  suggestedStagingTitle: string | null
  suggestedSetDate: Date | null
  suggestedStagingDate: Date | null
  suggestedSetChannel: string | null
  suggestedStagingChannel: string | null
  suggestedSetParticipants: string[]
  suggestedStagingParticipants: string[]
  scannedAt: Date
  lastRenamedAt: Date | null
  lastRenamedFrom: string | null
  nameFormatOk: boolean
  chanFolderName: string | null
  suggestedConfidence: string | null   // 'HIGH' | 'MEDIUM' | null
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
  all: number
  orphan: number
  linked: number
  phantom: number
  untracked: number
  ghost: number
}

export type GhostEntry = {
  id: string
  folderName: string
  fullPath: string
  scannedAt: Date
  isVideo: boolean
  fileCount: number | null
  parsedDate: Date | null
  linkedSetId: string | null
  linkedSetTitle: string | null
  linkedStagingId: string | null
  linkedStagingTitle: string | null
  chanFolderName: string | null
}

export type GroupBy = 'none' | 'channel' | 'year' | 'channelYear'
export type ArchiveSort = 'date' | 'name' | 'fileCount'
export type SortDir = 'asc' | 'desc'

export type ChannelSummary = {
  /** Channel folder name. '(unknown)' for folders with null chanFolderName. */
  chanFolderName: string
  count: number
}

export type WorkspaceFilters = {
  tab: 'all' | 'orphan' | 'linked' | 'phantom' | 'untracked' | 'ghost'
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
  /** When set, fetch only leaves for this specific channel folder (tree mode). */
  chanFolderName?: string
}

export type WorkspacePage = {
  items: ArchiveFolderEntry[] | PhantomEntry[] | UntrackedEntry[] | GhostEntry[]
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
      archiveKey: true,
    },
  })

  const records: ScanPreloadRecord[] = rows.map((r) => ({
    id: r.id,
    fullPath: r.fullPath,
    contentSignature: r.contentSignature,
    leafDirModifiedAt: r.leafDirModifiedAt?.toISOString() ?? null,
    yearDirModifiedAt: r.yearDirModifiedAt?.toISOString() ?? null,
    chanFolderModifiedAt: r.chanFolderModifiedAt?.toISOString() ?? null,
    archiveKey: r.archiveKey ?? null,
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
export type KeyConflict = {
  sidecarKey: string
  conflictingPath: string   // the other on-disk path that already owns this key in the DB
  currentPath: string       // the path being scanned now that also claims this key
}

export async function upsertArchiveFolders(
  items: FullIngestItem[],
  tenant: string,
): Promise<{ created: number; updated: number; renamed: number; unchanged: number; errors: number; keyConflicts: KeyConflict[] }> {
  const now = new Date()
  const counts = { created: 0, updated: 0, renamed: 0, unchanged: 0, errors: 0, keyConflicts: [] as KeyConflict[] }

  for (const item of items) {
    try {
    const parsedDate = item.parsedDate ? new Date(item.parsedDate) : null
    const leafDirModifiedAt = new Date(item.leafDirModifiedAt)
    const yearDirModifiedAt = new Date(item.yearDirModifiedAt)
    const chanFolderModifiedAt = new Date(item.chanFolderModifiedAt)

    if (item.action === 'create') {
      // Sidecar-key lookup: folder may have moved to a new path (possibly new drive/root).
      // If a sidecarKey is present, try to find the existing ArchiveFolder by archiveKey
      // and update its path in-place rather than creating a duplicate record.
      if (item.sidecarKey) {
        const existingBySidecar = await prisma.archiveFolder.findUnique({
          where: { archiveKey: item.sidecarKey },
          select: { id: true, archiveLink: { select: { id: true, setId: true, stagingSetId: true } } },
        })
        if (existingBySidecar) {
          const newRelative = await _computeRelativePath(item.fullPath, item.isVideo)
          await prisma.archiveFolder.update({
            where: { id: existingBySidecar.id },
            data: {
              fullPath: item.fullPath,
              relativePath: newRelative,
              folderName: item.folderName,
              parsedDate,
              parsedShortName: item.parsedShortName,
              parsedTitle: item.parsedTitle,
              nameFormatOk: item.nameFormatOk,
              chanFolderName: item.chanFolderName,
              contentSignature: item.contentSignature,
              fileCount: item.fileCount,
              videoPresent: item.videoPresent,
              videoFiles: item.videoFiles != null ? JSON.stringify(item.videoFiles) : undefined,
              leafDirModifiedAt,
              yearDirModifiedAt,
              chanFolderModifiedAt,
              lastRenamedFrom: item.fullPath,  // record move origin
              lastRenamedAt: now,
              scannedAt: now,
              missingOnDisk: false,
            },
          })
          // Propagate new relativePath to linked ArchiveLink.
          // Use OK + latest file count — the scanner just verified this folder exists.
          if (newRelative && existingBySidecar.archiveLink) {
            await prisma.archiveLink.update({
              where: { id: existingBySidecar.archiveLink.id },
              data: { archivePath: newRelative, archiveStatus: 'OK', archiveFileCount: item.fileCount ?? null, archiveLastChecked: now },
            })
          }
          counts.renamed++
          continue
        }
      }

      await prisma.archiveFolder.create({
        data: {
          fullPath: item.fullPath,
          isVideo: item.isVideo,
          fileCount: item.fileCount,
          videoPresent: item.videoPresent,
          videoFiles: item.videoFiles != null ? JSON.stringify(item.videoFiles) : null,
          folderName: item.folderName,
          parsedDate,
          parsedShortName: item.parsedShortName,
          parsedTitle: item.parsedTitle,
          nameFormatOk: item.nameFormatOk,
          chanFolderName: item.chanFolderName,
          contentSignature: item.contentSignature,
          leafDirModifiedAt,
          yearDirModifiedAt,
          chanFolderModifiedAt,
          scannedAt: now,
          missingOnDisk: false,
          tenant,
          // Prefer sidecarKey if folder was previously known (moved drive); otherwise generate fresh UUID
          archiveKey: item.sidecarKey ?? randomUUID(),
        },
      })
      counts.created++

    } else if (item.action === 'update') {
      // Prefer sidecar-key lookup so that case-only renames are handled correctly.
      // The PS1 script normalises paths to lowercase when building its lookup map, so a
      // case-only rename is invisible to it and arrives here as action='update' with the
      // NEW case as item.fullPath. PostgreSQL is case-sensitive, so WHERE fullPath = newCase
      // would fail with P2025 if the DB still stores the old case. Looking up by archiveKey
      // first and updating by id avoids that problem entirely.
      let targetId: string | undefined
      let correctedArchiveKey: string | undefined

      if (item.sidecarKey) {
        const byKey = await prisma.archiveFolder.findUnique({
          where: { archiveKey: item.sidecarKey },
          select: { id: true, fullPath: true },
        })
        if (byKey && byKey.fullPath.toLowerCase() === item.fullPath.toLowerCase()) {
          // Same folder (possibly just renamed in case) — update by id
          targetId = byKey.id
          correctedArchiveKey = item.sidecarKey
        } else if (byKey) {
          // Different path owns this key — genuine conflict, fall back to fullPath lookup
          counts.keyConflicts.push({
            sidecarKey: item.sidecarKey,
            conflictingPath: byKey.fullPath,
            currentPath: item.fullPath,
          })
        } else {
          // Key not yet in DB — write as a correction
          correctedArchiveKey = item.sidecarKey
        }
      }

      await prisma.archiveFolder.update({
        where: targetId ? { id: targetId } : { fullPath: item.fullPath },
        data: {
          ...(targetId ? { fullPath: item.fullPath } : {}),  // fix case when updating by id
          fileCount: item.fileCount,
          videoPresent: item.videoPresent,
          videoFiles: item.videoFiles != null ? JSON.stringify(item.videoFiles) : undefined,
          folderName: item.folderName,
          parsedDate,
          parsedShortName: item.parsedShortName,
          parsedTitle: item.parsedTitle,
          nameFormatOk: item.nameFormatOk,
          chanFolderName: item.chanFolderName,
          contentSignature: item.contentSignature,
          leafDirModifiedAt,
          yearDirModifiedAt,
          chanFolderModifiedAt,
          scannedAt: now,
          missingOnDisk: false,
          ...(correctedArchiveKey !== undefined ? { archiveKey: correctedArchiveKey } : {}),
        },
        select: { id: true },
      })
      counts.updated++

    } else if (item.action === 'rename' && item.previousFullPath) {
      // Find existing record by previous path
      const existing = await prisma.archiveFolder.findUnique({
        where: { fullPath: item.previousFullPath },
        select: {
          id: true,
          archiveLink: { select: { id: true } },
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
            isVideo: item.isVideo,
            parsedDate,
            parsedShortName: item.parsedShortName,
            parsedTitle: item.parsedTitle,
            nameFormatOk: item.nameFormatOk,
            chanFolderName: item.chanFolderName,
            contentSignature: item.contentSignature,
            fileCount: item.fileCount,
            videoPresent: item.videoPresent,
            videoFiles: item.videoFiles != null ? JSON.stringify(item.videoFiles) : undefined,
            leafDirModifiedAt,
            yearDirModifiedAt,
            chanFolderModifiedAt,
            lastRenamedFrom: item.previousFullPath,
            lastRenamedAt: now,
            scannedAt: now,
            missingOnDisk: false,
          },
        })

        // Propagate new relative path to linked ArchiveLink so archivePath stays current.
        // Use OK + latest file count — the scanner just verified this folder exists.
        if (newRelative && existing.archiveLink) {
          await prisma.archiveLink.update({
            where: { id: existing.archiveLink.id },
            data: { archivePath: newRelative, archiveStatus: 'OK', archiveFileCount: item.fileCount ?? null, archiveLastChecked: now },
          })
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
          chanFolderName: item.chanFolderName,
            contentSignature: item.contentSignature,
            leafDirModifiedAt,
            yearDirModifiedAt,
            chanFolderModifiedAt,
            scannedAt: now,
            missingOnDisk: false,
            tenant,
          },
          update: {
            contentSignature: item.contentSignature,
            leafDirModifiedAt,
            yearDirModifiedAt,
            chanFolderModifiedAt,
            scannedAt: now,
            missingOnDisk: false,
          },
        })
        counts.created++
      }

    } else if (item.action === 'unchanged') {
      // Same sidecar-key-first pattern as 'update': a case-only rename arrives here
      // when the leaf mtime didn't change (Windows doesn't update a folder's own mtime
      // on rename). Look up by archiveKey so the case-sensitive WHERE fullPath clause
      // doesn't fail with P2025.
      let targetId: string | undefined
      let correctedArchiveKey: string | undefined

      if (item.sidecarKey) {
        const byKey = await prisma.archiveFolder.findUnique({
          where: { archiveKey: item.sidecarKey },
          select: { id: true, fullPath: true },
        })
        if (byKey && byKey.fullPath.toLowerCase() === item.fullPath.toLowerCase()) {
          targetId = byKey.id
          correctedArchiveKey = item.sidecarKey
        } else if (byKey) {
          counts.keyConflicts.push({
            sidecarKey: item.sidecarKey,
            conflictingPath: byKey.fullPath,
            currentPath: item.fullPath,
          })
        } else {
          correctedArchiveKey = item.sidecarKey
        }
      }

      // Update parent mtime cache + parsed fields (backfills if regex improved) + nameFormatOk
      await prisma.archiveFolder.update({
        where: targetId ? { id: targetId } : { fullPath: item.fullPath },
        data: {
          ...(targetId ? { fullPath: item.fullPath } : {}),  // fix case when updating by id
          folderName: item.folderName,  // keep DB in sync with actual folder name on disk
          yearDirModifiedAt,
          chanFolderModifiedAt,
          scannedAt: now,
          missingOnDisk: false,
          parsedDate,
          parsedShortName: item.parsedShortName,
          parsedTitle: item.parsedTitle,
          nameFormatOk: item.nameFormatOk,
          chanFolderName: item.chanFolderName,
          ...(correctedArchiveKey !== undefined ? { archiveKey: correctedArchiveKey } : {}),
        },
      })
      counts.unchanged++
    }
    } catch (err) {
      counts.errors++
      console.error(`[archive/upsertArchiveFolders] failed for item ${item.action} ${item.fullPath}:`, err)
    }
  }

  return counts
}

/**
 * Strip a configured archive root from a full filesystem path to get the
 * relative path stored in the DB. Tries all configured roots; returns the
 * first match. Returns null if no root matches.
 */
async function _computeRelativePath(fullPath: string, isVideo: boolean): Promise<string | null> {
  const rootKey = isVideo ? ARCHIVE_VIDEOSET_ROOT_KEY : ARCHIVE_PHOTOSET_ROOT_KEY
  const rawRoots = await getSetting(rootKey)
  const roots = parseRoots(rawRoots)
  for (const root of roots) {
    const normRoot = root.replace(/[/\\]$/, '')
    if (fullPath.toLowerCase().startsWith(normRoot.toLowerCase())) {
      return fullPath.slice(normRoot.length).replace(/^[/\\]/, '')
    }
  }
  return null
}

/**
 * After upserting ArchiveFolder records, run the matching pass:
 * 1. Compute relativePath for each folder (strip known roots)
 * 2. Try parsedDate + parsedShortName → create SUGGESTED ArchiveLink
 * 3. Try trigram similarity → create SUGGESTED ArchiveLink (MEDIUM confidence)
 *
 * Only processes folders that have no CONFIRMED ArchiveLink yet.
 */
export async function runMatchingPass(
  tenant: string,
): Promise<{ linked: number; suggested: number }> {
  // Load folders that have no CONFIRMED ArchiveLink yet
  const folders = await prisma.archiveFolder.findMany({
    where: {
      tenant,
      OR: [
        { archiveLink: null },
        { archiveLink: { status: ArchiveLinkStatus.SUGGESTED } },
      ],
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

  const [rawPhotoRoots, rawVideoRoots] = await Promise.all([
    getSetting(ARCHIVE_PHOTOSET_ROOT_KEY),
    getSetting(ARCHIVE_VIDEOSET_ROOT_KEY),
  ])
  const photoRoots = parseRoots(rawPhotoRoots)
  const videoRoots = parseRoots(rawVideoRoots)

  const linked = 0; let suggested = 0

  for (const folder of folders) {
    let relativePath = folder.relativePath
    if (!relativePath) {
      const roots = folder.isVideo ? videoRoots : photoRoots
      for (const root of roots) {
        const normRoot = root.replace(/[/\\]$/, '')
        if (folder.fullPath.toLowerCase().startsWith(normRoot.toLowerCase())) {
          relativePath = folder.fullPath.slice(normRoot.length).replace(/^[/\\]/, '')
          await prisma.archiveFolder.update({ where: { id: folder.id }, data: { relativePath } })
          break
        }
      }
    }

    // Step 1 (HIGH confidence): exact parsedDate + exact parsedShortName → suggestion
    if (folder.parsedDate && folder.parsedShortName) {
      const dateStart = new Date(folder.parsedDate)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(dateStart)
      dateEnd.setDate(dateEnd.getDate() + 1)

      // Try staging sets first (skip PROMOTED + SKIPPED; skip sets already claimed by a different folder)
      // When parsedTitle is available, pick the best title-similarity match to avoid wrong-person
      // assignments on channels that publish multiple sets on the same date (e.g. MetArt).
      type StagingIdRow = { id: string }
      let stagingCandidateId: string | null = null

      if (folder.parsedTitle) {
        const rows = await prisma.$queryRaw<StagingIdRow[]>`
          SELECT ss.id
          FROM staging_set ss
          JOIN "Channel" c ON c.id = ss."channelId"
          WHERE ss."releaseDate" >= ${dateStart} AND ss."releaseDate" < ${dateEnd}
            AND LOWER(c."shortName") = LOWER(${folder.parsedShortName})
            AND ss.status NOT IN ('PROMOTED', 'SKIPPED')
            AND NOT EXISTS (
              SELECT 1 FROM "ArchiveLink" al
              WHERE al."stagingSetId" = ss.id
                AND al.status IN ('CONFIRMED', 'SUGGESTED')
                AND al."archiveFolderId" <> ${folder.id}
            )
          ORDER BY similarity(${folder.parsedTitle}, ss."titleNorm") DESC
          LIMIT 1
        `
        if (rows.length > 0 && rows[0]) stagingCandidateId = rows[0].id
      } else {
        const rows = await prisma.stagingSet.findMany({
          where: {
            releaseDate: { gte: dateStart, lt: dateEnd },
            channel: { shortName: { equals: folder.parsedShortName, mode: 'insensitive' } },
            status: { notIn: ['PROMOTED', 'SKIPPED'] },
            archiveLinks: { none: { status: { in: [ArchiveLinkStatus.CONFIRMED, ArchiveLinkStatus.SUGGESTED] } } },
          },
          select: { id: true },
          take: 1,
        })
        if (rows.length > 0) stagingCandidateId = rows[0].id
      }

      if (stagingCandidateId) {
        await prisma.archiveLink.upsert({
          where: { archiveFolderId: folder.id },
          create: { archiveFolderId: folder.id, stagingSetId: stagingCandidateId, status: 'SUGGESTED', confidence: 'HIGH', tenant },
          update: { stagingSetId: stagingCandidateId, setId: null, status: 'SUGGESTED', confidence: 'HIGH' },
        })
        // Remove any other SUGGESTED links that were previously pointing to the same staging set
        // from a different folder — prevents accumulation across multiple matching passes.
        await prisma.archiveLink.deleteMany({
          where: { stagingSetId: stagingCandidateId, status: ArchiveLinkStatus.SUGGESTED, archiveFolderId: { not: folder.id } },
        })
        suggested++
        continue
      }

      // Try promoted sets
      const setSuggestions = await prisma.set.findMany({
        where: {
          releaseDate: { gte: dateStart, lt: dateEnd },
          channel: { shortName: { equals: folder.parsedShortName, mode: 'insensitive' } },
          archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } },
        },
        select: { id: true },
        take: 1,
      })
      if (setSuggestions.length > 0) {
        // Dedup: skip if this set already has a SUGGESTED ArchiveLink from another folder
        const alreadyClaimed = await prisma.archiveLink.findFirst({
          where: { setId: setSuggestions[0].id, status: 'SUGGESTED', archiveFolderId: { not: folder.id } },
          select: { id: true },
        })
        if (!alreadyClaimed) {
          await prisma.archiveLink.upsert({
            where: { archiveFolderId: folder.id },
            create: { archiveFolderId: folder.id, setId: setSuggestions[0].id, status: 'SUGGESTED', confidence: 'HIGH', tenant },
            update: { setId: setSuggestions[0].id, stagingSetId: null, status: 'SUGGESTED', confidence: 'HIGH' },
          })
          suggested++
          continue
        }
      }
    }

    // Step 2 (MEDIUM confidence): same year + same shortName + title trigram similarity ≥ 0.4
    if (folder.parsedDate && folder.parsedShortName && folder.parsedTitle) {
      const year = folder.parsedDate.getFullYear()
      type SimilarityRow = { id: string; sim: number }

      const stagingMedium = await prisma.$queryRaw<SimilarityRow[]>`
        SELECT ss.id, similarity(${folder.parsedTitle}, ss."titleNorm") AS sim
        FROM staging_set ss
        JOIN "Channel" c ON c.id = ss."channelId"
        WHERE LOWER(c."shortName") = LOWER(${folder.parsedShortName})
          AND EXTRACT(YEAR FROM ss."releaseDate") = ${year}
          AND ss.status NOT IN ('PROMOTED', 'SKIPPED')
          AND NOT EXISTS (SELECT 1 FROM "ArchiveLink" al WHERE al."stagingSetId" = ss.id AND al.status IN ('CONFIRMED', 'SUGGESTED'))
          AND similarity(${folder.parsedTitle}, ss."titleNorm") >= 0.4
        ORDER BY sim DESC
        LIMIT 1
      `
      if (stagingMedium.length > 0 && stagingMedium[0]) {
        await prisma.archiveLink.upsert({
          where: { archiveFolderId: folder.id },
          create: { archiveFolderId: folder.id, stagingSetId: stagingMedium[0].id, status: 'SUGGESTED', confidence: 'MEDIUM', tenant },
          update: { stagingSetId: stagingMedium[0].id, setId: null, status: 'SUGGESTED', confidence: 'MEDIUM' },
        })
        // Remove any other SUGGESTED links previously pointing to the same staging set from a different folder
        await prisma.archiveLink.deleteMany({
          where: { stagingSetId: stagingMedium[0].id, status: ArchiveLinkStatus.SUGGESTED, archiveFolderId: { not: folder.id } },
        })
        suggested++
        continue
      }

      const setMedium = await prisma.$queryRaw<SimilarityRow[]>`
        SELECT s.id, similarity(${folder.parsedTitle}, s."titleNorm") AS sim
        FROM "Set" s
        JOIN "Channel" c ON c.id = s."channelId"
        WHERE LOWER(c."shortName") = LOWER(${folder.parsedShortName})
          AND EXTRACT(YEAR FROM s."releaseDate") = ${year}
          AND NOT EXISTS (SELECT 1 FROM "ArchiveLink" al WHERE al."setId" = s.id AND al.status = 'CONFIRMED')
          AND similarity(${folder.parsedTitle}, s."titleNorm") >= 0.4
        ORDER BY sim DESC
        LIMIT 1
      `
      if (setMedium.length > 0 && setMedium[0]) {
        const alreadyClaimed = await prisma.archiveLink.findFirst({
          where: { setId: setMedium[0].id, status: 'SUGGESTED', archiveFolderId: { not: folder.id } },
          select: { id: true },
        })
        if (!alreadyClaimed) {
          await prisma.archiveLink.upsert({
            where: { archiveFolderId: folder.id },
            create: { archiveFolderId: folder.id, setId: setMedium[0].id, status: 'SUGGESTED', confidence: 'MEDIUM', tenant },
            update: { setId: setMedium[0].id, stagingSetId: null, status: 'SUGGESTED', confidence: 'MEDIUM' },
          })
          suggested++
        }
      }
    }
  }

  // linked is always 0 now — we no longer do exact path matching
  return { linked, suggested }
}

function _normPath(p: string): string {
  return p.replace(/[/\\]+/g, '/').replace(/\/$/, '').toLowerCase()
}

// ─── Batch Suggestion Queries ─────────────────────────────────────────────────

export type SuggestedFolderInfo = {
  folderId: string
  folderName: string
  fileCount: number | null
  parsedDate: Date | null
  fullPath: string
  confidence: 'HIGH' | 'MEDIUM'
}

/**
 * For a batch of staging set IDs, find any SUGGESTED ArchiveLink.
 * Returns a Map<stagingSetId, SuggestedFolderInfo>.
 */
export async function getSuggestedFoldersForStagingSets(
  ids: string[],
): Promise<Map<string, SuggestedFolderInfo>> {
  if (ids.length === 0) return new Map()
  const links = await prisma.archiveLink.findMany({
    where: { stagingSetId: { in: ids }, status: 'SUGGESTED' },
    select: {
      stagingSetId: true, confidence: true,
      archiveFolder: { select: { id: true, folderName: true, fileCount: true, parsedDate: true, fullPath: true } },
    },
  })
  return new Map(
    links.map((l) => [
      l.stagingSetId!,
      {
        folderId: l.archiveFolder.id,
        folderName: l.archiveFolder.folderName,
        fileCount: l.archiveFolder.fileCount,
        parsedDate: l.archiveFolder.parsedDate,
        fullPath: l.archiveFolder.fullPath,
        confidence: (l.confidence as 'HIGH' | 'MEDIUM') ?? 'HIGH',
      },
    ]),
  )
}

/**
 * For a batch of Set IDs, find any SUGGESTED ArchiveLink.
 * Returns a Map<setId, SuggestedFolderInfo>.
 */
export async function getSuggestedFoldersForSets(
  ids: string[],
): Promise<Map<string, SuggestedFolderInfo>> {
  if (ids.length === 0) return new Map()
  const links = await prisma.archiveLink.findMany({
    where: { setId: { in: ids }, status: 'SUGGESTED' },
    select: {
      setId: true, confidence: true,
      archiveFolder: { select: { id: true, folderName: true, fileCount: true, parsedDate: true, fullPath: true } },
    },
  })
  return new Map(
    links.map((l) => [
      l.setId!,
      {
        folderId: l.archiveFolder.id,
        folderName: l.archiveFolder.folderName,
        fileCount: l.archiveFolder.fileCount,
        parsedDate: l.archiveFolder.parsedDate,
        fullPath: l.archiveFolder.fullPath,
        confidence: (l.confidence as 'HIGH' | 'MEDIUM') ?? 'HIGH',
      },
    ]),
  )
}

// ─── Archive Workspace Queries ────────────────────────────────────────────────

/**
 * Returns tab counts + paginated items for the /archive workspace page.
 */
export async function getArchiveWorkspace(filters: WorkspaceFilters): Promise<WorkspacePage> {
  const pageSize = filters.pageSize ?? 200
  const offset = filters.offset ?? 0

  // Always compute all tab counts together
  const [allCount, orphanCount, linkedCount, phantomCount, untrackedCount, ghostCount] = await Promise.all([
    prisma.archiveFolder.count({ where: { missingOnDisk: false } }),
    prisma.archiveFolder.count({
      where: {
        missingOnDisk: false,
        OR: [
          { archiveLink: null },
          { archiveLink: { status: ArchiveLinkStatus.SUGGESTED } },
        ],
      },
    }),
    prisma.archiveFolder.count({
      where: { archiveLink: { status: ArchiveLinkStatus.CONFIRMED }, missingOnDisk: false },
    }),
    prisma.archiveLink.count({ where: { status: 'CONFIRMED', archiveStatus: 'MISSING' } }),
    Promise.all([
      prisma.set.count({ where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } } } }),
      prisma.stagingSet.count({ where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } }, status: { not: 'PROMOTED' } } }),
    ]).then(([a, b]) => a + b),
    prisma.archiveFolder.count({ where: { missingOnDisk: true } }),
  ])

  const counts: WorkspaceCounts = {
    all: allCount,
    orphan: orphanCount,
    linked: linkedCount,
    phantom: phantomCount,
    untracked: untrackedCount,
    ghost: ghostCount,
  }

  // Build orderBy for archive folder tabs based on groupBy + sort preferences
  function buildOrderBy(groupBy: GroupBy | undefined, sort: ArchiveSort | undefined, sortDir: SortDir | undefined) {
    const dir = sortDir ?? 'desc'
    const channelFirst = [
      { chanFolderName: 'asc' as const },
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
    archiveLink: { select: { status: true, setId: true, stagingSetId: true, confidence: true } },
    scannedAt: true,
    lastRenamedAt: true,
    lastRenamedFrom: true,
    nameFormatOk: true,
    chanFolderName: true,
  } satisfies Prisma.ArchiveFolderSelect

  // Helper to map archiveLink fields to ArchiveFolderEntry link fields
  function mapLinkFields(r: { archiveLink: { status: string; setId: string | null; stagingSetId: string | null; confidence: string | null } | null }) {
    const linkedSetId = r.archiveLink?.status === 'CONFIRMED' ? (r.archiveLink.setId ?? null) : null
    const linkedStagingId = r.archiveLink?.status === 'CONFIRMED' ? (r.archiveLink.stagingSetId ?? null) : null
    const suggestedSetId = r.archiveLink?.status === 'SUGGESTED' ? (r.archiveLink.setId ?? null) : null
    const suggestedStagingId = r.archiveLink?.status === 'SUGGESTED' ? (r.archiveLink.stagingSetId ?? null) : null
    const suggestedConfidence = r.archiveLink?.status === 'SUGGESTED' ? (r.archiveLink.confidence ?? null) : null
    return { linkedSetId, linkedStagingId, suggestedSetId, suggestedStagingId, suggestedConfidence }
  }

  if (filters.tab === 'all') {
    const where: Prisma.ArchiveFolderWhereInput = {
      missingOnDisk: false,
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
      ...(filters.shortName ? { parsedShortName: { equals: filters.shortName, mode: 'insensitive' as const } } : {}),
      ...(filters.year ? {
        parsedDate: {
          gte: new Date(`${filters.year}-01-01`),
          lt: new Date(`${filters.year + 1}-01-01`),
        },
      } : {}),
      ...(filters.hasSuggestion ? {
        archiveLink: { status: ArchiveLinkStatus.SUGGESTED },
      } : {}),
      ...(filters.search ? {
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' as const } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(filters.chanFolderName !== undefined
        ? filters.chanFolderName === '(unknown)'
          ? { chanFolderName: null }
          : { chanFolderName: filters.chanFolderName }
        : {}),
    }

    const paginate = filters.chanFolderName === undefined
    const [total, rows] = await Promise.all([
      prisma.archiveFolder.count({ where }),
      prisma.archiveFolder.findMany({
        where,
        orderBy: buildOrderBy(filters.groupBy, filters.sort, filters.sortDir),
        ...(paginate ? { take: pageSize, skip: offset } : {}),
        select: folderSelect,
      }),
    ])

    // Enrich suggestion fields for rows with suggestions
    const suggestedSetIds = rows.map((r) => r.archiveLink?.status === 'SUGGESTED' ? r.archiveLink.setId : null).filter(Boolean) as string[]
    const suggestedStagingIds = rows.map((r) => r.archiveLink?.status === 'SUGGESTED' ? r.archiveLink.stagingSetId : null).filter(Boolean) as string[]

    type SuggestedSetAll = {
      id: string; title: string; releaseDate: Date | null
      channel: { name: string } | null
      participants: { person: { aliases: { name: string }[] } }[]
    }
    type SuggestedStagingAll = {
      id: string; title: string; releaseDate: Date | null; channelName: string; artist: string | null
    }

    const [suggestedSets, suggestedStagings] = await Promise.all([
      suggestedSetIds.length > 0
        ? prisma.set.findMany({
            where: { id: { in: suggestedSetIds } },
            select: {
              id: true, title: true, releaseDate: true,
              channel: { select: { name: true } },
              participants: {
                take: 4,
                select: { person: { select: { aliases: { where: { isCommon: true }, select: { name: true }, take: 1 } } } },
              },
            },
          }) as Promise<SuggestedSetAll[]>
        : Promise.resolve([] as SuggestedSetAll[]),
      suggestedStagingIds.length > 0
        ? prisma.stagingSet.findMany({
            where: { id: { in: suggestedStagingIds } },
            select: { id: true, title: true, releaseDate: true, channelName: true, artist: true },
          }) as Promise<SuggestedStagingAll[]>
        : Promise.resolve([] as SuggestedStagingAll[]),
    ])

    const setMapAll = new Map<string, SuggestedSetAll>(suggestedSets.map((s) => [s.id, s]))
    const stagingMapAll = new Map<string, SuggestedStagingAll>(suggestedStagings.map((s) => [s.id, s]))

    const items: ArchiveFolderEntry[] = rows.map((r) => {
      const { linkedSetId, linkedStagingId, suggestedSetId, suggestedStagingId, suggestedConfidence } = mapLinkFields(r)
      const ss = suggestedSetId ? setMapAll.get(suggestedSetId) : undefined
      const sg = suggestedStagingId ? stagingMapAll.get(suggestedStagingId) : undefined
      return {
        id: r.id,
        fullPath: r.fullPath,
        relativePath: r.relativePath,
        isVideo: r.isVideo,
        fileCount: r.fileCount,
        videoPresent: r.videoPresent,
        folderName: r.folderName,
        parsedDate: r.parsedDate,
        parsedShortName: r.parsedShortName,
        parsedTitle: r.parsedTitle,
        linkedSetId,
        linkedStagingId,
        suggestedSetId,
        suggestedStagingId,
        scannedAt: r.scannedAt,
        lastRenamedAt: r.lastRenamedAt,
        lastRenamedFrom: r.lastRenamedFrom,
        nameFormatOk: r.nameFormatOk,
        chanFolderName: r.chanFolderName,
        suggestedConfidence,
        suggestedSetTitle: ss?.title ?? null,
        suggestedStagingTitle: sg?.title ?? null,
        suggestedSetDate: ss?.releaseDate ?? null,
        suggestedStagingDate: sg?.releaseDate ?? null,
        suggestedSetChannel: ss?.channel?.name ?? null,
        suggestedStagingChannel: sg?.channelName ?? null,
        suggestedSetParticipants: ss
          ? ss.participants.map((p) => p.person.aliases[0]?.name).filter(Boolean) as string[]
          : [],
        suggestedStagingParticipants: sg?.artist ? [sg.artist] : [],
      }
    })

    return { items, total, counts, hasMore: paginate && rows.length === pageSize }
  }

  if (filters.tab === 'orphan') {
    const andClauses: Prisma.ArchiveFolderWhereInput[] = [
      {
        OR: [
          { archiveLink: null },
          { archiveLink: { status: ArchiveLinkStatus.SUGGESTED } },
        ],
      },
    ]
    if (filters.hasSuggestion) andClauses.push({ archiveLink: { status: ArchiveLinkStatus.SUGGESTED } })
    if (filters.search) {
      andClauses.push({
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' } },
        ],
      })
    }
    const where: Prisma.ArchiveFolderWhereInput = {
      missingOnDisk: false,
      AND: andClauses,
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
      ...(filters.shortName ? { parsedShortName: { equals: filters.shortName, mode: 'insensitive' as const } } : {}),
      ...(filters.year ? {
        parsedDate: {
          gte: new Date(`${filters.year}-01-01`),
          lt: new Date(`${filters.year + 1}-01-01`),
        },
      } : {}),
      ...(filters.chanFolderName !== undefined
        ? filters.chanFolderName === '(unknown)'
          ? { chanFolderName: null }
          : { chanFolderName: filters.chanFolderName }
        : {}),
    }

    const paginate = filters.chanFolderName === undefined
    const [total, rows] = await Promise.all([
      prisma.archiveFolder.count({ where }),
      prisma.archiveFolder.findMany({
        where,
        orderBy: buildOrderBy(filters.groupBy, filters.sort, filters.sortDir),
        ...(paginate ? { take: pageSize, skip: offset } : {}),
        select: folderSelect,
      }),
    ])

    // Fetch suggestion detail fields for display
    const suggestedSetIds = rows.map((r) => r.archiveLink?.status === 'SUGGESTED' ? r.archiveLink.setId : null).filter(Boolean) as string[]
    const suggestedStagingIds = rows.map((r) => r.archiveLink?.status === 'SUGGESTED' ? r.archiveLink.stagingSetId : null).filter(Boolean) as string[]

    type SuggestedSet = {
      id: string
      title: string
      releaseDate: Date | null
      channel: { name: string } | null
      participants: { person: { aliases: { name: string }[] } }[]
    }
    type SuggestedStaging = {
      id: string
      title: string
      releaseDate: Date | null
      channelName: string
      artist: string | null
    }

    const [suggestedSets, suggestedStagings] = await Promise.all([
      suggestedSetIds.length > 0
        ? prisma.set.findMany({
            where: { id: { in: suggestedSetIds } },
            select: {
              id: true,
              title: true,
              releaseDate: true,
              channel: { select: { name: true } },
              participants: {
                take: 4,
                select: {
                  person: {
                    select: {
                      aliases: {
                        where: { isCommon: true },
                        select: { name: true },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          }) as Promise<SuggestedSet[]>
        : Promise.resolve([] as SuggestedSet[]),
      suggestedStagingIds.length > 0
        ? prisma.stagingSet.findMany({
            where: { id: { in: suggestedStagingIds } },
            select: {
              id: true,
              title: true,
              releaseDate: true,
              channelName: true,
              artist: true,
            },
          }) as Promise<SuggestedStaging[]>
        : Promise.resolve([] as SuggestedStaging[]),
    ])

    const setMap = new Map<string, SuggestedSet>(suggestedSets.map((s) => [s.id, s]))
    const stagingMap = new Map<string, SuggestedStaging>(suggestedStagings.map((s) => [s.id, s]))

    const items: ArchiveFolderEntry[] = rows.map((r) => {
      const { linkedSetId, linkedStagingId, suggestedSetId, suggestedStagingId, suggestedConfidence } = mapLinkFields(r)
      const ss = suggestedSetId ? setMap.get(suggestedSetId) : undefined
      const sg = suggestedStagingId ? stagingMap.get(suggestedStagingId) : undefined
      return {
        id: r.id,
        fullPath: r.fullPath,
        relativePath: r.relativePath,
        isVideo: r.isVideo,
        fileCount: r.fileCount,
        videoPresent: r.videoPresent,
        folderName: r.folderName,
        parsedDate: r.parsedDate,
        parsedShortName: r.parsedShortName,
        parsedTitle: r.parsedTitle,
        linkedSetId,
        linkedStagingId,
        suggestedSetId,
        suggestedStagingId,
        scannedAt: r.scannedAt,
        lastRenamedAt: r.lastRenamedAt,
        lastRenamedFrom: r.lastRenamedFrom,
        nameFormatOk: r.nameFormatOk,
        chanFolderName: r.chanFolderName,
        suggestedConfidence,
        suggestedSetTitle: ss?.title ?? null,
        suggestedStagingTitle: sg?.title ?? null,
        suggestedSetDate: ss?.releaseDate ?? null,
        suggestedStagingDate: sg?.releaseDate ?? null,
        suggestedSetChannel: ss?.channel?.name ?? null,
        suggestedStagingChannel: sg?.channelName ?? null,
        suggestedSetParticipants: ss
          ? ss.participants.map((p) => p.person.aliases[0]?.name).filter(Boolean) as string[]
          : [],
        suggestedStagingParticipants: sg?.artist ? [sg.artist] : [],
      }
    })

    return { items, total, counts, hasMore: paginate && rows.length === pageSize }
  }

  if (filters.tab === 'linked') {
    const where: Prisma.ArchiveFolderWhereInput = {
      archiveLink: { status: ArchiveLinkStatus.CONFIRMED },
      missingOnDisk: false,
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
      ...(filters.chanFolderName !== undefined
        ? filters.chanFolderName === '(unknown)'
          ? { chanFolderName: null }
          : { chanFolderName: filters.chanFolderName }
        : {}),
    }

    const paginate = filters.chanFolderName === undefined
    const [total, rows] = await Promise.all([
      prisma.archiveFolder.count({ where }),
      prisma.archiveFolder.findMany({
        where,
        orderBy: buildOrderBy(filters.groupBy, filters.sort, filters.sortDir),
        ...(paginate ? { take: pageSize, skip: offset } : {}),
        select: folderSelect,
      }),
    ])

    const items: ArchiveFolderEntry[] = rows.map((r) => {
      const { linkedSetId, linkedStagingId } = mapLinkFields(r)
      return {
        id: r.id,
        fullPath: r.fullPath,
        relativePath: r.relativePath,
        isVideo: r.isVideo,
        fileCount: r.fileCount,
        videoPresent: r.videoPresent,
        folderName: r.folderName,
        parsedDate: r.parsedDate,
        parsedShortName: r.parsedShortName,
        parsedTitle: r.parsedTitle,
        linkedSetId,
        linkedStagingId,
        suggestedSetId: null,
        suggestedStagingId: null,
        scannedAt: r.scannedAt,
        lastRenamedAt: r.lastRenamedAt,
        lastRenamedFrom: r.lastRenamedFrom,
        nameFormatOk: r.nameFormatOk,
        chanFolderName: r.chanFolderName,
        suggestedConfidence: null,
        suggestedSetTitle: null,
        suggestedStagingTitle: null,
        suggestedSetDate: null,
        suggestedStagingDate: null,
        suggestedSetChannel: null,
        suggestedStagingChannel: null,
        suggestedSetParticipants: [],
        suggestedStagingParticipants: [],
      }
    })

    return { items, total, counts, hasMore: paginate && rows.length === pageSize }
  }

  if (filters.tab === 'phantom') {
    const videoWhere = filters.isVideo !== undefined
      ? (filters.isVideo ? ({ archiveFolder: { isVideo: true } }) : ({ archiveFolder: { isVideo: false } }))
      : {}

    const linkWhere = {
      status: 'CONFIRMED' as const,
      archiveStatus: 'MISSING' as const,
      ...videoWhere,
    }

    const [total, links] = await Promise.all([
      prisma.archiveLink.count({ where: linkWhere }),
      prisma.archiveLink.findMany({
        where: linkWhere,
        select: {
          id: true, archivePath: true, archiveStatus: true, archiveLastChecked: true,
          setId: true, stagingSetId: true,
          set: { select: { id: true, title: true, releaseDate: true, type: true, channel: { select: { name: true } } } },
          stagingSet: { select: { id: true, title: true, releaseDate: true, isVideo: true, channelName: true } },
          archiveFolder: { select: { isVideo: true } },
        },
        orderBy: { archiveLastChecked: 'desc' },
        take: pageSize,
        skip: offset,
      }),
    ])

    const items: PhantomEntry[] = links.map((l) => ({
      id: l.setId ?? l.stagingSetId ?? l.id,
      type: l.setId ? 'set' as const : 'staging' as const,
      title: l.set?.title ?? l.stagingSet?.title ?? '(unknown)',
      archivePath: l.archivePath ?? '',
      archiveStatus: l.archiveStatus,
      archiveLastChecked: l.archiveLastChecked,
      channelName: l.set?.channel?.name ?? l.stagingSet?.channelName ?? null,
      releaseDate: l.set?.releaseDate ?? l.stagingSet?.releaseDate ?? null,
      isVideo: l.setId ? l.set?.type === 'video' : (l.stagingSet?.isVideo ?? l.archiveFolder.isVideo),
    }))

    return { items, total, counts, hasMore: false }
  }

  if (filters.tab === 'ghost') {
    const paginate = pageSize > 0
    const rows = await prisma.archiveFolder.findMany({
      where: { missingOnDisk: true },
      select: {
        id: true, folderName: true, fullPath: true, scannedAt: true,
        isVideo: true, fileCount: true, parsedDate: true,
        chanFolderName: true,
        archiveLink: {
          select: {
            status: true, setId: true, stagingSetId: true,
            set: { select: { title: true } },
            stagingSet: { select: { title: true } },
          },
        },
      },
      orderBy: [
        { scannedAt: 'desc' },
      ],
      ...(paginate ? { take: pageSize, skip: offset } : {}),
    })
    const total = await prisma.archiveFolder.count({ where: { missingOnDisk: true } })
    const items: GhostEntry[] = rows.map((r) => {
      const linkedSetId = r.archiveLink?.status === 'CONFIRMED' ? (r.archiveLink.setId ?? null) : null
      const linkedStagingId = r.archiveLink?.status === 'CONFIRMED' ? (r.archiveLink.stagingSetId ?? null) : null
      return {
        id: r.id, folderName: r.folderName, fullPath: r.fullPath,
        scannedAt: r.scannedAt, isVideo: r.isVideo, fileCount: r.fileCount,
        parsedDate: r.parsedDate,
        linkedSetId,
        linkedSetTitle: linkedSetId ? (r.archiveLink?.set?.title ?? null) : null,
        linkedStagingId,
        linkedStagingTitle: linkedStagingId ? (r.archiveLink?.stagingSet?.title ?? null) : null,
        chanFolderName: r.chanFolderName,
      }
    })
    return { items, total, counts, hasMore: paginate && rows.length === pageSize }
  }

  // tab === 'untracked'
  const videoWhere = filters.isVideo !== undefined
    ? (filters.isVideo ? ({ type: 'video' as const }) : ({ type: { not: 'video' as const } }))
    : {}

  const [sets, stagings, setTotal, stagingTotal] = await Promise.all([
    prisma.set.findMany({
      where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } }, ...videoWhere },
      select: { id: true, title: true, releaseDate: true, type: true, channel: { select: { name: true } } },
      orderBy: { releaseDate: 'desc' },
      take: pageSize,
      skip: offset,
    }),
    prisma.stagingSet.findMany({
      where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } }, status: { not: 'PROMOTED' }, ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}) },
      select: { id: true, title: true, releaseDate: true, isVideo: true, channelName: true },
      orderBy: { releaseDate: 'desc' },
      take: pageSize,
      skip: offset,
    }),
    prisma.set.count({ where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } }, ...videoWhere } }),
    prisma.stagingSet.count({ where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } }, status: { not: 'PROMOTED' }, ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}) } }),
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
 * Creates/updates a CONFIRMED ArchiveLink record and writes archive fields into it.
 */
export async function confirmArchiveFolderLink(
  folderId: string,
  targetId: string,
  type: 'set' | 'staging',
): Promise<void> {
  const folder = await prisma.archiveFolder.findUnique({
    where: { id: folderId },
    select: { relativePath: true, fileCount: true, videoPresent: true, tenant: true },
  })
  if (!folder) throw new Error('Archive folder not found')

  let confirmedSetId: string | null = null
  let confirmedStagingId: string | null = null

  if (type === 'staging') {
    // Guard: if staging set is PROMOTED, redirect to promoted Set
    const ss = await prisma.stagingSet.findUnique({
      where: { id: targetId },
      select: { status: true, promotedSetId: true },
    })
    if (!ss) throw new Error('Staging set not found')
    if (ss.status === 'PROMOTED' && ss.promotedSetId) {
      confirmedSetId = ss.promotedSetId
    } else {
      confirmedStagingId = targetId
    }
  } else {
    confirmedSetId = targetId
  }

  const archiveFields = folder.relativePath ? {
    archivePath: folder.relativePath,
    archiveStatus: 'OK' as const,
    archiveFileCount: folder.fileCount ?? null,
    archiveVideoPresent: folder.videoPresent ?? null,
  } : {}

  await prisma.archiveLink.upsert({
    where: { archiveFolderId: folderId },
    create: {
      archiveFolderId: folderId,
      setId: confirmedSetId,
      stagingSetId: confirmedStagingId,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      tenant: folder.tenant,
      ...archiveFields,
    },
    update: {
      setId: confirmedSetId,
      stagingSetId: confirmedStagingId,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      confidence: null,
      ...archiveFields,
    },
  })
}

// ─── Suggestion lookup for Set detail page ──────────────────────────────────

export type ArchiveSuggestionForSet = {
  folderId: string
  folderName: string
  fullPath: string
  relativePath: string | null
  fileCount: number | null
  parsedDate: Date | null
  confidence: string | null
}

/**
 * Returns all pending archive folder suggestions for a given Set, ranked HIGH first.
 * Used by the Set detail page to show an inline confirm/reject list.
 *
 * Also surfaces "stale staging suggestions": folders whose SUGGESTED ArchiveLink still
 * points at the staging set that was promoted to this Set.
 */
export async function getArchiveSuggestionsForSet(
  setId: string,
): Promise<ArchiveSuggestionForSet[]> {
  // Direct: folders with SUGGESTED link to this set
  const direct = await prisma.archiveLink.findMany({
    where: { setId, status: 'SUGGESTED' },
    select: {
      archiveFolder: { select: { id: true, folderName: true, fullPath: true, relativePath: true, fileCount: true, parsedDate: true } },
      confidence: true,
    },
    orderBy: { confidence: 'asc' }, // HIGH before MEDIUM alphabetically
    take: 5,
  })

  // Staging-origin fallback: folders with SUGGESTED link to the staging set that promoted to this Set
  const stagingOrigin = await prisma.stagingSet.findFirst({
    where: { promotedSetId: setId, status: 'PROMOTED' },
    select: { id: true },
  })
  const viaStagingOrigin = stagingOrigin
    ? await prisma.archiveLink.findMany({
        where: { stagingSetId: stagingOrigin.id, status: 'SUGGESTED' },
        select: {
          archiveFolder: { select: { id: true, folderName: true, fullPath: true, relativePath: true, fileCount: true, parsedDate: true } },
          confidence: true,
        },
        take: 5,
      })
    : []

  const seen = new Set(direct.map((l) => l.archiveFolder.id))
  const merged = [
    ...direct,
    ...viaStagingOrigin.filter((l) => !seen.has(l.archiveFolder.id)),
  ]

  return merged.slice(0, 5).map((l) => ({
    folderId: l.archiveFolder.id,
    folderName: l.archiveFolder.folderName,
    fullPath: l.archiveFolder.fullPath,
    relativePath: l.archiveFolder.relativePath,
    fileCount: l.archiveFolder.fileCount,
    parsedDate: l.archiveFolder.parsedDate,
    confidence: l.confidence,
  }))
}

/**
 * Dismiss a suggestion — folder remains as an orphan.
 */
export async function rejectArchiveSuggestion(folderId: string): Promise<void> {
  await prisma.archiveLink.deleteMany({
    where: { archiveFolderId: folderId, status: 'SUGGESTED' },
  })
}

/**
 * Create a minimal StagingSet from an orphan ArchiveFolder.
 * Pre-populates title (folder name), channelName (parsed short name), releaseDate,
 * and creates a CONFIRMED ArchiveLink for the folder.
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

  const stagingSet = await prisma.stagingSet.create({
    data: {
      title: folder.parsedTitle ?? folder.folderName,
      channelName,
      channelId: channelId ?? null,
      releaseDate: folder.parsedDate ?? undefined,
      isVideo: folder.isVideo,
    },
    select: { id: true },
  })

  // Create CONFIRMED ArchiveLink
  await prisma.archiveLink.create({
    data: {
      archiveFolderId: folderId,
      stagingSetId: stagingSet.id,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      archivePath: folder.relativePath ?? undefined,
      archiveStatus: folder.relativePath ? 'PENDING' : 'UNKNOWN',
      tenant: folder.tenant,
    },
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
function extractChanFolderName(fullPath: string): string | null {
  const clean = fullPath.replace(/[/\\]+$/, '')
  const parts = clean.split(/[/\\]/)
  return parts[parts.length - 3] ?? null
}

export async function reparseFolderNames(tenant: string): Promise<{ updated: number }> {
  const folders = await prisma.archiveFolder.findMany({
    where: {
      tenant,
      OR: [{ parsedShortName: null }, { nameFormatOk: false }, { chanFolderName: null }],
    },
    select: { id: true, folderName: true, fullPath: true },
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
        chanFolderName: extractChanFolderName(folder.fullPath),
      },
    })
    updated++
  }

  return { updated }
}

export async function deleteArchiveFolder(id: string): Promise<void> {
  await prisma.archiveFolder.delete({ where: { id } })
}

/**
 * Marks all ArchiveFolder records that were not visited in the most recent full scan
 * as missing on disk. Called by the scan script after all batches complete.
 * Records visited in this scan already have missingOnDisk=false (set during upsert).
 */
export async function markGhostFolders(
  scanStartedAt: Date,
  tenant: string,
): Promise<{ marked: number }> {
  const result = await prisma.archiveFolder.updateMany({
    where: { tenant, scannedAt: { lt: scanStartedAt } },
    data: { missingOnDisk: true },
  })
  return { marked: result.count }
}

// ─── Archive Tree: Channel Summaries ─────────────────────────────────────────

/**
 * Returns a lightweight list of channel folder names with leaf counts for the
 * given tab and filters. Used by the archive workspace tree view to populate
 * channel-header rows without loading all leaf folders upfront.
 */
export async function getArchiveChannelSummaries(
  tab: 'all' | 'orphan' | 'linked',
  filters: Pick<WorkspaceFilters, 'isVideo' | 'search' | 'hasSuggestion'>,
): Promise<{ summaries: ChannelSummary[]; counts: WorkspaceCounts }> {
  let where: Prisma.ArchiveFolderWhereInput
  if (tab === 'orphan') {
    const andClauses: Prisma.ArchiveFolderWhereInput[] = [
      {
        OR: [
          { archiveLink: null },
          { archiveLink: { status: ArchiveLinkStatus.SUGGESTED } },
        ],
      },
    ]
    if (filters.hasSuggestion) andClauses.push({ archiveLink: { status: ArchiveLinkStatus.SUGGESTED } })
    if (filters.search) {
      andClauses.push({
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' } },
        ],
      })
    }
    where = {
      missingOnDisk: false,
      AND: andClauses,
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
    }
  } else if (tab === 'linked') {
    where = {
      archiveLink: { status: ArchiveLinkStatus.CONFIRMED },
      missingOnDisk: false,
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
      ...(filters.search ? {
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' as const } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    }
  } else {
    where = {
      missingOnDisk: false,
      ...(filters.isVideo !== undefined ? { isVideo: filters.isVideo } : {}),
      ...(filters.search ? {
        OR: [
          { folderName: { contains: filters.search, mode: 'insensitive' as const } },
          { parsedTitle: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    }
  }

  const [grouped, allCount, orphanCount, linkedCount, phantomCount, untrackedCount, ghostCount] = await Promise.all([
    prisma.archiveFolder.groupBy({
      by: ['chanFolderName'],
      where,
      _count: true,
      orderBy: { chanFolderName: 'asc' },
    }),
    prisma.archiveFolder.count({ where: { missingOnDisk: false } }),
    prisma.archiveFolder.count({
      where: {
        missingOnDisk: false,
        OR: [
          { archiveLink: null },
          { archiveLink: { status: ArchiveLinkStatus.SUGGESTED } },
        ],
      },
    }),
    prisma.archiveFolder.count({
      where: { archiveLink: { status: ArchiveLinkStatus.CONFIRMED }, missingOnDisk: false },
    }),
    prisma.archiveLink.count({ where: { status: 'CONFIRMED', archiveStatus: 'MISSING' } }),
    Promise.all([
      prisma.set.count({ where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } } } }),
      prisma.stagingSet.count({ where: { archiveLinks: { none: { status: ArchiveLinkStatus.CONFIRMED } }, status: { not: 'PROMOTED' } } }),
    ]).then(([a, b]) => a + b),
    prisma.archiveFolder.count({ where: { missingOnDisk: true } }),
  ])

  const summaries: ChannelSummary[] = grouped.map((g) => ({
    chanFolderName: g.chanFolderName ?? '(unknown)',
    count: g._count as number,
  }))

  return {
    summaries,
    counts: {
      all: allCount,
      orphan: orphanCount,
      linked: linkedCount,
      phantom: phantomCount,
      untracked: untrackedCount,
      ghost: ghostCount,
    },
  }
}
