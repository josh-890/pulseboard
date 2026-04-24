/**
 * Coherence service — maintains SetCoherenceSnapshot, a single cross-bucket row
 * per logical set entry that spans Active Set + Staging Set + Archive Folder.
 *
 * All mutations are fire-and-forget (called with `void`) to avoid blocking
 * user-facing operations. Snapshot rows are created on first relevant mutation
 * and merged when links are established (e.g. archive folder linked to a
 * staging set that is then promoted to an active set).
 */

import { prisma } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoherenceUpsertInput = {
  setId?: string
  stagingSetId?: string
  archiveFolderId?: string
  archiveStatus?: string
  hasMediaInApp?: boolean
  archiveFileCount?: number | null
  lastVerifiedAt?: Date | null
}

// ─── Core upsert ──────────────────────────────────────────────────────────────

/**
 * Find-or-create a coherence snapshot row using any of the three IDs as lookup
 * keys, then apply the provided field updates. If multiple existing rows are
 * found (rare edge case where IDs belong to different rows), they are merged
 * into a single row and the extras are deleted.
 */
export async function upsertCoherenceSnapshot(input: CoherenceUpsertInput): Promise<void> {
  const { setId, stagingSetId, archiveFolderId, ...fields } = input

  // Find all matching snapshots by any provided ID
  const candidates = await prisma.setCoherenceSnapshot.findMany({
    where: {
      OR: [
        ...(setId          ? [{ setId }]          : []),
        ...(stagingSetId   ? [{ stagingSetId }]   : []),
        ...(archiveFolderId ? [{ archiveFolderId }] : []),
      ],
    },
  })

  const updateData = {
    ...(setId          !== undefined ? { setId }          : {}),
    ...(stagingSetId   !== undefined ? { stagingSetId }   : {}),
    ...(archiveFolderId !== undefined ? { archiveFolderId } : {}),
    ...(fields.archiveStatus   !== undefined ? { archiveStatus: fields.archiveStatus }   : {}),
    ...(fields.hasMediaInApp   !== undefined ? { hasMediaInApp: fields.hasMediaInApp }   : {}),
    ...(fields.archiveFileCount !== undefined ? { archiveFileCount: fields.archiveFileCount } : {}),
    ...(fields.lastVerifiedAt  !== undefined ? { lastVerifiedAt: fields.lastVerifiedAt }  : {}),
  }

  if (candidates.length === 0) {
    // Create new snapshot
    await prisma.setCoherenceSnapshot.create({
      data: {
        setId:           setId ?? null,
        stagingSetId:    stagingSetId ?? null,
        archiveFolderId: archiveFolderId ?? null,
        archiveStatus:   fields.archiveStatus ?? 'NONE',
        hasMediaInApp:   fields.hasMediaInApp ?? false,
        archiveFileCount: fields.archiveFileCount ?? null,
        lastVerifiedAt:  fields.lastVerifiedAt ?? null,
      },
    })
    return
  }

  if (candidates.length === 1) {
    await prisma.setCoherenceSnapshot.update({
      where: { id: candidates[0].id },
      data: updateData,
    })
    return
  }

  // Multiple rows found — merge into the first, delete the rest
  const [keep, ...extras] = candidates
  const merged = { ...keep, ...updateData }
  // Collect any IDs from extra rows that the primary row is missing
  for (const extra of extras) {
    if (!merged.setId && extra.setId)                 merged.setId = extra.setId
    if (!merged.stagingSetId && extra.stagingSetId)   merged.stagingSetId = extra.stagingSetId
    if (!merged.archiveFolderId && extra.archiveFolderId) merged.archiveFolderId = extra.archiveFolderId
  }
  // Delete duplicates FIRST so unique constraints don't block the subsequent update.
  await prisma.$transaction([
    prisma.setCoherenceSnapshot.deleteMany({
      where: { id: { in: extras.map((e) => e.id) } },
    }),
    prisma.setCoherenceSnapshot.update({
      where: { id: keep.id },
      data: {
        setId: merged.setId,
        stagingSetId: merged.stagingSetId,
        archiveFolderId: merged.archiveFolderId,
        archiveStatus: merged.archiveStatus,
        hasMediaInApp: merged.hasMediaInApp,
        archiveFileCount: merged.archiveFileCount,
        lastVerifiedAt: merged.lastVerifiedAt,
      },
    }),
  ])
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * Called after a staging set is promoted to an active set.
 * Merges the staging-only snapshot with the new set ID.
 */
export async function onSetPromoted(stagingSetId: string, setId: string): Promise<void> {
  await upsertCoherenceSnapshot({ stagingSetId, setId })
}

/**
 * Called after an archive folder is confirmed-linked to a set or staging set.
 */
export async function onArchiveFolderLinked(
  archiveFolderId: string,
  opts: { setId?: string; stagingSetId?: string },
): Promise<void> {
  // Read current folder status to populate the snapshot
  const folder = await prisma.archiveFolder.findUnique({
    where: { id: archiveFolderId },
    select: { fileCount: true },
  })
  await upsertCoherenceSnapshot({
    archiveFolderId,
    setId: opts.setId,
    stagingSetId: opts.stagingSetId,
    archiveStatus: 'LINKED',
    archiveFileCount: folder?.fileCount ?? null,
  })
}

/**
 * Called after a SetMediaItem is created or deleted.
 * Recomputes hasMediaInApp for the affected set.
 */
export async function onMediaImportChanged(setId: string): Promise<void> {
  const count = await prisma.setMediaItem.count({ where: { setId } })
  await upsertCoherenceSnapshot({ setId, hasMediaInApp: count > 0 })
}

/**
 * Called after an archive scan updates an ArchiveFolder's status + file count.
 */
export async function onArchiveScanComplete(
  archiveFolderId: string,
  status: string,
  fileCount: number,
): Promise<void> {
  await upsertCoherenceSnapshot({
    archiveFolderId,
    archiveStatus: status,
    archiveFileCount: fileCount,
    lastVerifiedAt: status === 'OK' ? new Date() : undefined,
  })
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

/**
 * Populate SetCoherenceSnapshot for all existing data.
 * Run once after the migration: `npx tsx src/scripts/backfill-coherence.ts`
 */
export async function backfillCoherenceSnapshots(): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0

  // 1. Archive folders with confirmed links
  const linkedFolders = await prisma.archiveFolder.findMany({
    where: { OR: [{ linkedSetId: { not: null } }, { linkedStagingSet: { isNot: null } }] },
    select: {
      id: true,
      linkedSetId: true,
      linkedStagingSet: { select: { id: true } },
      fileCount: true,
    },
  })

  for (const folder of linkedFolders) {
    const linkedStagingId = folder.linkedStagingSet?.id ?? null
    const existing = await prisma.setCoherenceSnapshot.findFirst({
      where: {
        OR: [
          { archiveFolderId: folder.id },
          ...(folder.linkedSetId ? [{ setId: folder.linkedSetId }] : []),
          ...(linkedStagingId ? [{ stagingSetId: linkedStagingId }] : []),
        ],
      },
    })
    if (existing) {
      await prisma.setCoherenceSnapshot.update({
        where: { id: existing.id },
        data: {
          archiveFolderId: folder.id,
          ...(folder.linkedSetId ? { setId: folder.linkedSetId } : {}),
          ...(linkedStagingId ? { stagingSetId: linkedStagingId } : {}),
          archiveFileCount: folder.fileCount,
        },
      })
      updated++
    } else {
      // Check media import status
      let hasMediaInApp = false
      if (folder.linkedSetId) {
        const mediaCount = await prisma.setMediaItem.count({ where: { setId: folder.linkedSetId } })
        hasMediaInApp = mediaCount > 0
      }
      await prisma.setCoherenceSnapshot.create({
        data: {
          setId: folder.linkedSetId ?? null,
          stagingSetId: linkedStagingId,
          archiveFolderId: folder.id,
          archiveStatus: 'LINKED',
          archiveFileCount: folder.fileCount,
          hasMediaInApp,
        },
      })
      created++
    }
  }

  // 2. Staging sets without archive folders (not yet covered above)
  const stagingSets = await prisma.stagingSet.findMany({
    where: { coherenceSnapshot: null },
    select: { id: true, promotedSetId: true },
  })
  for (const ss of stagingSets) {
    // Check if the promoted set already has a snapshot
    if (ss.promotedSetId) {
      const existing = await prisma.setCoherenceSnapshot.findFirst({
        where: { setId: ss.promotedSetId },
      })
      if (existing) {
        await prisma.setCoherenceSnapshot.update({
          where: { id: existing.id },
          data: { stagingSetId: ss.id },
        })
        updated++
        continue
      }
    }
    const hasMediaInApp = ss.promotedSetId
      ? (await prisma.setMediaItem.count({ where: { setId: ss.promotedSetId } })) > 0
      : false
    await prisma.setCoherenceSnapshot.create({
      data: {
        stagingSetId: ss.id,
        setId: ss.promotedSetId ?? null,
        hasMediaInApp,
      },
    })
    created++
  }

  // 3. Active sets without any snapshot
  const sets = await prisma.set.findMany({
    where: { coherenceSnapshot: null },
    select: { id: true },
  })
  for (const set of sets) {
    const mediaCount = await prisma.setMediaItem.count({ where: { setId: set.id } })
    await prisma.setCoherenceSnapshot.create({
      data: { setId: set.id, hasMediaInApp: mediaCount > 0 },
    })
    created++
  }

  return { created, updated }
}
