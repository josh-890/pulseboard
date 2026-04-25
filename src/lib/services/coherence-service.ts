/**
 * Coherence service — maintains SetCoherenceSnapshot, a single cross-bucket row
 * per logical set entry that spans Active Set + Staging Set.
 *
 * Archive state now lives in ArchiveLink — this service only tracks app-side
 * media presence (hasMediaInApp).
 *
 * All mutations are fire-and-forget (called with `void`) to avoid blocking
 * user-facing operations.
 */

import { prisma } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CoherenceUpsertInput = {
  setId?: string
  stagingSetId?: string
  hasMediaInApp?: boolean
}

// ─── Core upsert ──────────────────────────────────────────────────────────────

/**
 * Find-or-create a coherence snapshot row using setId or stagingSetId as lookup
 * keys, then apply the provided field updates. If multiple existing rows are
 * found (rare edge case), they are merged into a single row and extras deleted.
 */
export async function upsertCoherenceSnapshot(input: CoherenceUpsertInput): Promise<void> {
  const { setId, stagingSetId, ...fields } = input

  const candidates = await prisma.setCoherenceSnapshot.findMany({
    where: {
      OR: [
        ...(setId        ? [{ setId }]        : []),
        ...(stagingSetId ? [{ stagingSetId }] : []),
      ],
    },
  })

  const updateData = {
    ...(setId        !== undefined ? { setId }        : {}),
    ...(stagingSetId !== undefined ? { stagingSetId } : {}),
    ...(fields.hasMediaInApp !== undefined ? { hasMediaInApp: fields.hasMediaInApp } : {}),
  }

  if (candidates.length === 0) {
    await prisma.setCoherenceSnapshot.create({
      data: {
        setId:        setId ?? null,
        stagingSetId: stagingSetId ?? null,
        hasMediaInApp: fields.hasMediaInApp ?? false,
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
  for (const extra of extras) {
    if (!merged.setId && extra.setId)               merged.setId = extra.setId
    if (!merged.stagingSetId && extra.stagingSetId) merged.stagingSetId = extra.stagingSetId
  }
  await prisma.$transaction([
    prisma.setCoherenceSnapshot.deleteMany({
      where: { id: { in: extras.map((e) => e.id) } },
    }),
    prisma.setCoherenceSnapshot.update({
      where: { id: keep.id },
      data: {
        setId:        merged.setId,
        stagingSetId: merged.stagingSetId,
        hasMediaInApp: merged.hasMediaInApp,
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
 * Called after a SetMediaItem is created or deleted.
 * Recomputes hasMediaInApp for the affected set.
 */
export async function onMediaImportChanged(setId: string): Promise<void> {
  const count = await prisma.setMediaItem.count({ where: { setId } })
  await upsertCoherenceSnapshot({ setId, hasMediaInApp: count > 0 })
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

/**
 * Populate SetCoherenceSnapshot for all existing data.
 * Run once after the migration: `npx tsx src/scripts/backfill-coherence.ts`
 */
export async function backfillCoherenceSnapshots(): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0

  // 1. Staging sets without snapshot
  const stagingSets = await prisma.stagingSet.findMany({
    where: { coherenceSnapshot: null },
    select: { id: true, promotedSetId: true },
  })
  for (const ss of stagingSets) {
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
      data: { stagingSetId: ss.id, setId: ss.promotedSetId ?? null, hasMediaInApp },
    })
    created++
  }

  // 2. Active sets without any snapshot
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
