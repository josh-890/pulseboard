/**
 * The archive side of the catalogue join (ADR-0027, plan slice 0). Read-only.
 *
 * Serves two populations, because a hit rate with nothing to check it against is
 * not a measurement:
 *   orphans     — folders with no confirmed link; what the join is meant to explain
 *   groundTruth — folders already linked to a Set with known participants, so
 *                 recall can be measured against pairs the app already knows
 */
import { prisma } from '@/lib/db'
import { parseFolderParticipantRaw } from '@/lib/services/archive-service'

export type AttributionOrphan = {
  archiveKey: string
  folderName: string
  fullPath: string
  parsedDate: string | null
  parsedShortName: string | null
  parsedTitle: string | null
  /** Participant token parsed from the folder name — the grouping half of the key. */
  aliasToken: string | null
  isVideo: boolean
}

export type AttributionGroundTruth = {
  archiveKey: string
  folderName: string
  parsedDate: string | null
  parsedShortName: string | null
  parsedTitle: string | null
  /** What the app already knows: the set, and who is in it. */
  setTitle: string
  setReleaseDate: string | null
  channelName: string | null
  channelShortName: string | null
  participantIcgIds: string[]
}

export type AttributionWorklist = {
  counts: { orphans: number; groundTruth: number }
  orphans: AttributionOrphan[]
  groundTruth: AttributionGroundTruth[]
}

const isoDay = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

export async function getAttributionWorklist(
  opts: { limit?: number } = {},
): Promise<AttributionWorklist> {
  const orphanRows = await prisma.archiveFolder.findMany({
    where: { missingOnDisk: false, archiveLink: null },
    select: {
      archiveKey: true,
      folderName: true,
      fullPath: true,
      parsedDate: true,
      parsedShortName: true,
      parsedTitle: true,
      isVideo: true,
    },
    orderBy: { fullPath: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  })

  const truthRows = await prisma.archiveFolder.findMany({
    where: {
      missingOnDisk: false,
      archiveLink: { status: 'CONFIRMED', setId: { not: null } },
    },
    select: {
      archiveKey: true,
      folderName: true,
      parsedDate: true,
      parsedShortName: true,
      parsedTitle: true,
      archiveLink: {
        select: {
          set: {
            select: {
              title: true,
              releaseDate: true,
              channel: { select: { name: true, shortName: true } },
              participants: { select: { person: { select: { icgId: true } } } },
            },
          },
        },
      },
    },
    orderBy: { folderName: 'asc' },
  })

  return {
    counts: { orphans: orphanRows.length, groundTruth: truthRows.length },
    orphans: orphanRows.map((r) => ({
      archiveKey: r.archiveKey,
      folderName: r.folderName,
      fullPath: r.fullPath,
      parsedDate: isoDay(r.parsedDate),
      parsedShortName: r.parsedShortName,
      parsedTitle: r.parsedTitle,
      aliasToken: parseFolderParticipantRaw(r.folderName),
      isVideo: r.isVideo,
    })),
    groundTruth: truthRows.flatMap((r) => {
      const set = r.archiveLink?.set
      if (!set) return []
      return [
        {
          archiveKey: r.archiveKey,
          folderName: r.folderName,
          parsedDate: isoDay(r.parsedDate),
          parsedShortName: r.parsedShortName,
          parsedTitle: r.parsedTitle,
          setTitle: set.title,
          setReleaseDate: isoDay(set.releaseDate),
          channelName: set.channel?.name ?? null,
          channelShortName: set.channel?.shortName ?? null,
          participantIcgIds: set.participants
            .map((p) => p.person?.icgId)
            .filter((x): x is string => !!x),
        },
      ]
    }),
  }
}
