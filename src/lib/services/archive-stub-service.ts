/**
 * Stub archive folders (ADR-0032) — marking, ending, and what ending sets off.
 *
 * The flag sits on the ArchiveFolder: the publication is complete, only the copy
 * on disk is a placeholder. Either side may set or end it; `reconcileStub`
 * (lib/archive-stub.ts) decides between the app and `.pb\STUB`, and the
 * app side of both directions comes through here.
 */

import { prisma } from '@/lib/db'
import { clearArchiveFolderCover } from '@/lib/services/archive-cover-service'
import type { StubReason } from '@/generated/prisma/client'
import { reconcileStub, toArchiveStub } from '@/lib/archive-stub'
import type { ArchiveStub } from '@/lib/archive-stub'
import { PHOTO_WHERE } from '@/lib/media-role'
import { buildUrl } from '@/lib/media-url'

export type MarkStubInput = { reason: StubReason; note?: string | null }

/** Mark (or re-describe) a folder as a stub. Keeps the original date on an edit. */
export async function markArchiveFolderStub(folderId: string, input: MarkStubInput): Promise<void> {
  const folder = await prisma.archiveFolder.findUniqueOrThrow({
    where: { id: folderId },
    select: { stubSince: true },
  })
  const note = input.note?.trim() || null
  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { stubSince: folder.stubSince ?? new Date(), stubReason: input.reason, stubNote: note },
  })
}

/**
 * End a stub — the media in the folder are the real set now. The same whichever
 * side ended it (ADR-0032 §6): the folder cover, a thumbnail of the stub media, is
 * reset so the cover agent rebuilds it, and `stubEndedAt` raises the offer to
 * re-import the set's media until it is dismissed.
 */
export async function endArchiveFolderStub(folderId: string): Promise<void> {
  const folder = await prisma.archiveFolder.findUniqueOrThrow({
    where: { id: folderId },
    select: { stubSince: true },
  })
  if (!folder.stubSince) return
  await prisma.archiveFolder.update({
    where: { id: folderId },
    data: { stubSince: null, stubReason: null, stubNote: null, stubEndedAt: new Date() },
  })
  await clearArchiveFolderCover(folderId)
}

// ─── The Stubs view (ADR-0032 §7) ───────────────────────────────────────────

/**
 * A folder counts as touched after it was marked when its leaf directory changed
 * more than this after `stubSince` — margin for the scan writing `.pb\STUB` itself.
 */
const TOUCHED_MARGIN_MS = 60 * 60 * 1000

export type ArchiveStubEntry = {
  id: string
  folderName: string
  fullPath: string
  chanFolderName: string | null
  isVideo: boolean
  missingOnDisk: boolean
  coverUrl: string | null
  coverError: string | null
  /** Files the last scan counted in the folder */
  fileCount: number | null
  stub: ArchiveStub
  /** Leaf folder LastWriteTime as the last Full scan saw it */
  folderChangedAt: Date | null
  scannedAt: Date
  /**
   * Files were added, removed or renamed after the folder was marked — the
   * upgrade may have happened. Overwriting files under the same names does not
   * move the folder's time, so false proves nothing.
   */
  touchedSinceStub: boolean
  /** The promoted set or the staged set the folder is linked to (CONFIRMED) */
  set: { id: string; title: string; photos: number; hadMedia: boolean } | null
  stagingSet: { id: string; title: string } | null
}

/** Every stub folder: touched ones first, then the most recently marked. */
export async function getArchiveStubs(): Promise<ArchiveStubEntry[]> {
  const folders = await prisma.archiveFolder.findMany({
    where: { stubSince: { not: null } },
    select: {
      id: true,
      folderName: true,
      fullPath: true,
      chanFolderName: true,
      isVideo: true,
      missingOnDisk: true,
      coverKey: true,
      coverError: true,
      fileCount: true,
      stubSince: true,
      stubReason: true,
      stubNote: true,
      leafDirModifiedAt: true,
      scannedAt: true,
      archiveLink: {
        select: {
          status: true,
          set: {
            select: {
              id: true,
              title: true,
              firstMediaAt: true,
              _count: { select: { setMediaItems: { where: { mediaItem: { mediaType: 'PHOTO', ...PHOTO_WHERE } } } } },
            },
          },
          stagingSet: { select: { id: true, title: true } },
        },
      },
    },
  })
  const entries = folders.flatMap((f): ArchiveStubEntry[] => {
    const stub = toArchiveStub(f)
    if (!stub) return []
    const link = f.archiveLink?.status === 'CONFIRMED' ? f.archiveLink : null
    return [
      {
        id: f.id,
        folderName: f.folderName,
        fullPath: f.fullPath,
        chanFolderName: f.chanFolderName,
        isVideo: f.isVideo,
        missingOnDisk: f.missingOnDisk,
        coverUrl: f.coverKey ? buildUrl(f.coverKey) : null,
        coverError: f.coverError,
        fileCount: f.fileCount,
        stub,
        folderChangedAt: f.leafDirModifiedAt,
        scannedAt: f.scannedAt,
        touchedSinceStub:
          f.leafDirModifiedAt !== null && f.leafDirModifiedAt.getTime() > stub.since.getTime() + TOUCHED_MARGIN_MS,
        set: link?.set
          ? {
              id: link.set.id,
              title: link.set.title,
              photos: link.set._count.setMediaItems,
              hadMedia: link.set.firstMediaAt !== null,
            }
          : null,
        stagingSet: link?.set ? null : (link?.stagingSet ?? null),
      },
    ]
  })
  return entries.sort(
    (a, b) =>
      Number(b.touchedSinceStub) - Number(a.touchedSinceStub) || b.stub.since.getTime() - a.stub.since.getTime(),
  )
}

/** Stub folders still on disk — the tab count */
export async function countArchiveStubs(): Promise<number> {
  return prisma.archiveFolder.count({ where: { stubSince: { not: null }, missingOnDisk: false } })
}

/** The "re-import media" offer has been taken or declined. */
export async function dismissStubEnded(folderId: string): Promise<void> {
  await prisma.archiveFolder.update({ where: { id: folderId }, data: { stubEndedAt: null } })
}

// ─── The disk side (ADR-0032 §3) ────────────────────────────────────────────

export type StubScanCounts = {
  /** `STUB` appeared on disk → the folder became a stub in the app. */
  markedFromDisk: number
  /** `STUB` was deleted on disk → the stub ended in the app. */
  endedFromDisk: number
  /** The app moved and the disk has not followed yet — the agent writes these next. */
  toWrite: number
}

type StubScanItem = { fullPath: string; stubOnDisk?: unknown; stubNote?: unknown }

/**
 * Reconcile what a Full scan saw in each `.pb\` with the app's flag, after
 * the folders themselves have been upserted. Only items that carry `stubOnDisk` as
 * a boolean are looked at: a targeted scan or an older agent sends nothing, and
 * "not looked" must never read as "deleted".
 */
export async function reconcileStubsFromScan(items: StubScanItem[]): Promise<StubScanCounts> {
  const counts: StubScanCounts = { markedFromDisk: 0, endedFromDisk: 0, toWrite: 0 }
  const reported = items.filter((i) => typeof i.stubOnDisk === 'boolean')
  if (reported.length === 0) return counts

  const folders = await prisma.archiveFolder.findMany({
    where: { fullPath: { in: reported.map((i) => i.fullPath) } },
    select: { id: true, fullPath: true, stubSince: true, stubDiskState: true },
  })
  const byPath = new Map(folders.map((f) => [f.fullPath, f]))

  for (const item of reported) {
    const folder = byPath.get(item.fullPath)
    if (!folder) continue
    const diskNow = item.stubOnDisk === true
    const r = reconcileStub({ diskNow, lastSeen: folder.stubDiskState, appNow: folder.stubSince !== null })

    if (r.source === 'disk') {
      if (r.appNext) {
        // The file says "stub", not why — the reason stays open until you give one.
        const note = typeof item.stubNote === 'string' ? item.stubNote.trim().slice(0, 500) || null : null
        await prisma.archiveFolder.update({
          where: { id: folder.id },
          data: { stubSince: new Date(), stubReason: null, stubNote: note },
        })
        counts.markedFromDisk++
      } else {
        await endArchiveFolderStub(folder.id)
        counts.endedFromDisk++
      }
    }
    if (r.diskWanted !== diskNow) counts.toWrite++
    if (folder.stubDiskState !== r.lastSeenNext) {
      await prisma.archiveFolder.update({ where: { id: folder.id }, data: { stubDiskState: r.lastSeenNext } })
    }
  }
  return counts
}

export type StubWrite = {
  fullPath: string
  /** true: create `.pb\STUB` (with the note as its text); false: remove it. */
  want: boolean
  note: string | null
}

/**
 * What the agent must change on disk: folders whose app flag differs from what the
 * disk last said. A folder the scan has never reported is written only when it is a
 * stub (nothing to remove from a folder never seen). Missing folders are left out.
 */
export async function getStubWrites(): Promise<StubWrite[]> {
  const rows = await prisma.archiveFolder.findMany({
    where: {
      missingOnDisk: false,
      OR: [
        // Spelled out: NOT { stubDiskState: true } would drop the NULL rows too,
        // since NOT (NULL = true) is NULL — and a never-reported stub is exactly the
        // one that needs its first write.
        { stubSince: { not: null }, OR: [{ stubDiskState: false }, { stubDiskState: null }] },
        { stubSince: null, stubDiskState: true },
      ],
    },
    select: { fullPath: true, stubSince: true, stubNote: true },
    orderBy: { fullPath: 'asc' },
  })
  return rows.map((r) => ({ fullPath: r.fullPath, want: r.stubSince !== null, note: r.stubNote }))
}
