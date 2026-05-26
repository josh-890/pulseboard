import { prisma } from '@/lib/db'
import { cascadeDeleteSet } from './cascade-helpers'
import { mergeSessionsInTx } from './session-service'
import { normalizeForSearch } from '@/lib/normalize'

export type MergeStats = {
  survivingId: string
  absorbedId: string
  survivingTitle: string
  absorbedTitle: string
  mediaTransferred: number
  creditsTransferred: number
  creditsDeduped: number
  sessionsMerged: number
}

type SetWithScore = {
  id: string
  title: string
  externalId: string | null
  isComplete: boolean
  coverMediaItemId: string | null
  _count: { setMediaItems: number }
  archiveLinks: { status: string }[]
}

function computeMergeScore(set: SetWithScore): number {
  let score = 0
  score += set._count.setMediaItems * 10
  score += set.archiveLinks.some((l) => l.status === 'CONFIRMED') ? 100 : 0
  score += set.isComplete ? 50 : 0
  score += set.externalId ? 5 : 0
  return score
}

export async function getSetMergeCandidates(setId: string) {
  const set = await prisma.set.findUniqueOrThrow({
    where: { id: setId },
    select: { titleNorm: true, channelId: true, releaseDate: true },
  })

  const titleNorm = set.titleNorm ?? ''

  const candidates = await prisma.$queryRaw<
    Array<{ id: string; title: string; channel_name: string | null; release_date: Date | null; media_count: number; sim: number }>
  >`
    SELECT
      s.id,
      s.title,
      c.name AS channel_name,
      s."releaseDate" AS release_date,
      (SELECT COUNT(*)::int FROM "SetMediaItem" smi WHERE smi."setId" = s.id) AS media_count,
      similarity(s."titleNorm", ${titleNorm}) AS sim
    FROM "Set" s
    LEFT JOIN "Channel" c ON c.id = s."channelId"
    WHERE s.id != ${setId}
      AND similarity(s."titleNorm", ${titleNorm}) > 0.5
    ORDER BY
      (s."channelId" = ${set.channelId ?? ''}) DESC,
      sim DESC
    LIMIT 20
  `

  return candidates.map((r) => ({
    id: r.id,
    title: r.title,
    channelName: r.channel_name,
    releaseDate: r.release_date,
    mediaCount: Number(r.media_count),
    similarity: Number(r.sim),
  }))
}

export async function mergeSetRecords(setIdA: string, setIdB: string): Promise<MergeStats> {
  if (setIdA === setIdB) throw new Error('Cannot merge a set with itself')

  const [setA, setB] = await Promise.all([
    prisma.set.findUniqueOrThrow({
      where: { id: setIdA },
      select: {
        id: true, title: true, externalId: true, channelId: true, isComplete: true, coverMediaItemId: true,
        _count: { select: { setMediaItems: true } },
        archiveLinks: { select: { status: true, archivePath: true } },
        sessionLinks: { where: { isPrimary: true }, select: { sessionId: true } },
      },
    }),
    prisma.set.findUniqueOrThrow({
      where: { id: setIdB },
      select: {
        id: true, title: true, externalId: true, channelId: true, isComplete: true, coverMediaItemId: true,
        _count: { select: { setMediaItems: true } },
        archiveLinks: { select: { status: true, archivePath: true } },
        sessionLinks: { where: { isPrimary: true }, select: { sessionId: true } },
      },
    }),
  ])

  // Guard: a merge means "these two rows represent the same entity", so any
  // identity column populated on both sides must agree. externalId is a stable
  // source-of-truth identifier; channelId is the production source. If either
  // disagrees, the operator is almost certainly merging the wrong target
  // (xpulse 2026-05-26: a Slim Babe Set was merged into Pink Heart Set,
  // silently rewiring the Slim Babe staging set's promotedSetId via the
  // staging_set UPDATE below). Block here instead.
  if (setA.externalId && setB.externalId && setA.externalId !== setB.externalId) {
    throw new Error(
      `Refusing to merge sets with conflicting externalId ("${setA.externalId}" vs "${setB.externalId}"). External IDs are stable identifiers — if both are set and they differ, these are not the same entity. Clear one externalId manually if you're sure this merge is intended.`,
    )
  }
  if (setA.channelId && setB.channelId && setA.channelId !== setB.channelId) {
    throw new Error(
      `Refusing to merge sets from different channels ("${setA.title}" / channel ${setA.channelId} vs "${setB.title}" / channel ${setB.channelId}). A set belongs to exactly one production channel; cross-channel merges are almost always a wrong-target accident.`,
    )
  }

  // Guard: both sets have CONFIRMED archive links on different folders
  const aConfirmed = setA.archiveLinks.find((l) => l.status === 'CONFIRMED')
  const bConfirmed = setB.archiveLinks.find((l) => l.status === 'CONFIRMED')
  if (aConfirmed && bConfirmed && aConfirmed.archivePath !== bConfirmed.archivePath) {
    throw new Error(
      `Both sets have distinct confirmed archive links ("${aConfirmed.archivePath}" vs "${bConfirmed.archivePath}"). Manual intervention required.`,
    )
  }

  const scoreA = computeMergeScore(setA)
  const scoreB = computeMergeScore(setB)
  const surviving = scoreA >= scoreB ? setA : setB
  const absorbed = scoreA >= scoreB ? setB : setA

  const survivingId = surviving.id
  const absorbedId = absorbed.id

  let mediaTransferred = 0
  let creditsTransferred = 0
  let creditsDeduped = 0
  let sessionsMerged = 0

  const survivingSession = surviving.sessionLinks[0]
  const absorbedSession = absorbed.sessionLinks[0]

  await prisma.$transaction(async (tx) => {
    // Merge sessions atomically inside the same transaction
    if (survivingSession && absorbedSession && survivingSession.sessionId !== absorbedSession.sessionId) {
      await mergeSessionsInTx(tx, survivingSession.sessionId, absorbedSession.sessionId)
      sessionsMerged = 1
    }

    // Pre-fetch surviving credits for dedup (avoids N+1 findFirst per absorbed credit)
    const survivingCredits = await tx.setCreditRaw.findMany({
      where: { setId: survivingId },
      select: { id: true, nameNorm: true, roleDefinitionId: true, resolutionStatus: true },
    })
    const survivingCreditMap = new Map(
      survivingCredits.map(c => [`${c.nameNorm ?? ""}__${c.roleDefinitionId ?? ""}`, c])
    )

    // Fetch absorbed credits to merge
    const absorbedCredits = await tx.setCreditRaw.findMany({
      where: { setId: absorbedId },
      select: { id: true, rawName: true, nameNorm: true, roleDefinitionId: true, resolutionStatus: true, resolvedPersonId: true, resolvedArtistId: true },
    })

    for (const credit of absorbedCredits) {
      const key = `${credit.nameNorm ?? normalizeForSearch(credit.rawName)}__${credit.roleDefinitionId ?? ""}`
      const existingOnSurviving = survivingCreditMap.get(key) ?? null

      if (existingOnSurviving) {
        // Keep the RESOLVED one; delete the duplicate
        const keepAbsorbed = credit.resolutionStatus === 'RESOLVED' && existingOnSurviving.resolutionStatus !== 'RESOLVED'
        if (keepAbsorbed) {
          await tx.setCreditRaw.update({
            where: { id: existingOnSurviving.id },
            data: {
              resolutionStatus: credit.resolutionStatus,
              resolvedPersonId: credit.resolvedPersonId,
              resolvedArtistId: credit.resolvedArtistId,
            },
          })
        }
        await tx.setCreditRaw.delete({ where: { id: credit.id } })
        creditsDeduped++
      } else {
        await tx.setCreditRaw.update({ where: { id: credit.id }, data: { setId: survivingId } })
        creditsTransferred++
      }
    }

    // Merge SetLabelEvidence (composite PK: setId + labelId + evidenceType)
    const absorbedEvidence = await tx.setLabelEvidence.findMany({
      where: { setId: absorbedId },
      select: { labelId: true, evidenceType: true, confidence: true },
    })
    for (const ev of absorbedEvidence) {
      const existing = await tx.setLabelEvidence.findUnique({
        where: { setId_labelId_evidenceType: { setId: survivingId, labelId: ev.labelId, evidenceType: ev.evidenceType } },
        select: { confidence: true },
      })
      if (!existing) {
        await tx.setLabelEvidence.create({
          data: { setId: survivingId, labelId: ev.labelId, evidenceType: ev.evidenceType, confidence: ev.confidence },
        })
      }
      // Delete the absorbed one regardless
      await tx.setLabelEvidence.delete({
        where: { setId_labelId_evidenceType: { setId: absorbedId, labelId: ev.labelId, evidenceType: ev.evidenceType } },
      })
    }

    // Merge SetMediaItem (append to surviving)
    const absorbedMediaCount = await tx.setMediaItem.count({ where: { setId: absorbedId } })
    const survivingMaxOrder = await tx.setMediaItem.aggregate({
      where: { setId: survivingId },
      _max: { sortOrder: true },
    })
    const baseOrder = (survivingMaxOrder._max.sortOrder ?? 0) + 1

    // Pre-fetch surviving media IDs to avoid N+1 findUnique per absorbed item
    const survivingMediaIds = new Set(
      (await tx.setMediaItem.findMany({ where: { setId: survivingId }, select: { mediaItemId: true } }))
        .map(m => m.mediaItemId)
    )

    const absorbedMedia = await tx.setMediaItem.findMany({
      where: { setId: absorbedId },
      orderBy: { sortOrder: 'asc' },
    })
    for (let i = 0; i < absorbedMedia.length; i++) {
      const item = absorbedMedia[i]!
      if (!survivingMediaIds.has(item.mediaItemId)) {
        await tx.setMediaItem.create({
          data: { setId: survivingId, mediaItemId: item.mediaItemId, sortOrder: baseOrder + i },
        })
        mediaTransferred++
      }
      await tx.setMediaItem.delete({
        where: { setId_mediaItemId: { setId: absorbedId, mediaItemId: item.mediaItemId } },
      })
    }
    mediaTransferred = mediaTransferred || absorbedMediaCount

    // Merge SetTag (skip duplicates)
    const survivingTagIds = new Set(
      (await tx.setTag.findMany({ where: { setId: survivingId }, select: { tagDefinitionId: true } }))
        .map(t => t.tagDefinitionId)
    )
    const absorbedTags = await tx.setTag.findMany({ where: { setId: absorbedId }, select: { tagDefinitionId: true } })
    for (const tag of absorbedTags) {
      if (!survivingTagIds.has(tag.tagDefinitionId)) {
        await tx.setTag.create({ data: { setId: survivingId, tagDefinitionId: tag.tagDefinitionId } })
      }
    }

    // Fill empty scalar fields on surviving
    // externalId is @unique — null it on absorbed first to avoid a transient collision
    if (!surviving.externalId && absorbed.externalId) {
      await tx.set.update({ where: { id: absorbedId }, data: { externalId: null } })
    }
    const updates: Record<string, unknown> = {}
    if (!surviving.externalId && absorbed.externalId) updates.externalId = absorbed.externalId
    if (!surviving.isComplete && absorbed.isComplete) updates.isComplete = true
    if (!surviving.coverMediaItemId && absorbed.coverMediaItemId) updates.coverMediaItemId = absorbed.coverMediaItemId
    if (Object.keys(updates).length > 0) {
      await tx.set.update({ where: { id: survivingId }, data: updates })
    }

    // Update staging_set references to point to surviving
    await tx.$executeRaw`
      UPDATE staging_set
      SET "promotedSetId" = ${survivingId}
      WHERE "promotedSetId" = ${absorbedId}
    `
    await tx.$executeRaw`
      UPDATE staging_set
      SET "matchedSetId" = ${survivingId}
      WHERE "matchedSetId" = ${absorbedId}
    `

    // Delete absorbed coherence snapshot
    await tx.$executeRaw`
      DELETE FROM set_coherence_snapshots WHERE "setId" = ${absorbedId}
    `

    // Cascade delete the absorbed set (remaining child records + set row)
    await cascadeDeleteSet(tx, absorbedId)
  }, { timeout: 30_000 })

  return {
    survivingId,
    absorbedId,
    survivingTitle: surviving.title,
    absorbedTitle: absorbed.title,
    mediaTransferred,
    creditsTransferred,
    creditsDeduped,
    sessionsMerged,
  }
}

export async function getPotentialDuplicatePairs(): Promise<
  Array<{ idA: string; titleA: string; idB: string; titleB: string; similarity: number; channelName: string | null; releaseDate: Date | null }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      id_a: string; title_a: string; id_b: string; title_b: string
      sim: number; channel_name: string | null; release_date: Date | null
    }>
  >`
    SELECT
      s1.id AS id_a, s1.title AS title_a,
      s2.id AS id_b, s2.title AS title_b,
      similarity(s1."titleNorm", s2."titleNorm") AS sim,
      c.name AS channel_name,
      s1."releaseDate" AS release_date
    FROM "Set" s1
    JOIN "Set" s2
      ON s1.id < s2.id
      AND s1."channelId" = s2."channelId"
      AND s1."releaseDate" = s2."releaseDate"
      AND similarity(s1."titleNorm", s2."titleNorm") > 0.6
    LEFT JOIN "Channel" c ON c.id = s1."channelId"
    ORDER BY sim DESC
  `

  return rows.map((r) => ({
    idA: r.id_a,
    titleA: r.title_a,
    idB: r.id_b,
    titleB: r.title_b,
    similarity: Number(r.sim),
    channelName: r.channel_name,
    releaseDate: r.release_date,
  }))
}
