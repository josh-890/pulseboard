import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import { buildUrl, localMediaUrlOrNull } from '@/lib/media-url'
import { parseFolderParticipantRaw } from '@/lib/services/archive-service'

// The last check before a folder becomes a NEW staged set (2026-10-16): which
// staged sets could this folder already be? Shown in the "Add known set" sheet with
// as much as there is to decide on at a glance — cover beside the folder's own,
// title, channel, date, cast, image count, status — so the operator can link to
// the right one instead of creating a twin. `findExistingStagingSet` keeps doing
// the silent reuse for the one unmistakable case (same day, same title, unlinked);
// this casts the wider net and leaves the decision to the person looking.

export type FolderMatchReason =
  | 'suggested' //    the matcher's SUGGESTED link points at it
  | 'same-title' //   normalised titles equal
  | 'similar-title' // trigram similarity ≥ 0.35
  | 'same-date' //    same release day
  | 'near-date' //    within 3 days
  | 'same-channel' // the folder's channel code resolves to its channel
  | 'same-person' //  a claimed ICG-ID or the folder-name alias is in its cast

export type FolderMatchCandidate = {
  id: string
  title: string
  channelName: string
  releaseDate: string | null
  status: string
  isVideo: boolean
  imageCount: number | null
  /** Local media only — a harvested publisher URL is never rendered */
  coverUrl: string | null
  externalId: string | null
  participants: string[]
  fromImport: boolean
  reasons: FolderMatchReason[]
  /** Days between the release dates; null when either is undated */
  dayDistance: number | null
  /** The folder this set is already CONFIRMED to — it cannot take a second one */
  linkedFolderName: string | null
  /** Promoted: linking goes to its Set */
  promotedSetId: string | null
}

export type FolderMatchCheck = {
  folder: {
    folderName: string
    coverUrl: string | null
    releaseDate: string | null
    fileCount: number | null
    isVideo: boolean
  }
  candidates: FolderMatchCandidate[]
}

type CandidateRow = {
  id: string
  title: string
  channelName: string
  releaseDate: Date | null
  status: string
  isVideo: boolean
  imageCount: number | null
  coverImageUrl: string | null
  externalId: string | null
  participants: unknown
  importBatchId: string | null
  promotedSetId: string | null
  sim: number
  day: number | null
  chan: boolean
  person: boolean
  suggested: boolean
  linkedFolderName: string | null
  linkedFolderCoverKey: string | null
}

// Release dates are stored at local midnight (2020-01-28 → 2020-01-27T23:00Z), so
// the day is read in the display zone, not off the UTC string
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.DISPLAY_TIMEZONE ?? 'Europe/Berlin' })
const isoDay = (d: Date | null) => (d ? DAY.format(d) : null)

function castNames(participants: unknown): string[] {
  if (!Array.isArray(participants)) return []
  return participants.flatMap((p) =>
    p && typeof p === 'object' && 'name' in p && typeof p.name === 'string' ? [p.name] : [],
  )
}

/** Why a row is a candidate, strongest first (pure — unit-tested) */
export function matchReasons(r: {
  suggested: boolean
  sim: number
  day: number | null
  chan: boolean
  person: boolean
}): FolderMatchReason[] {
  const out: FolderMatchReason[] = []
  if (r.suggested) out.push('suggested')
  if (r.sim >= 0.999) out.push('same-title')
  else if (r.sim >= 0.35) out.push('similar-title')
  if (r.day === 0) out.push('same-date')
  else if (r.day !== null && r.day <= 3) out.push('near-date')
  if (r.chan) out.push('same-channel')
  if (r.person) out.push('same-person')
  return out
}

export async function findStagingCandidatesForFolder(folderId: string, limit = 8): Promise<FolderMatchCheck> {
  const folder = await prisma.archiveFolder.findUnique({
    where: { id: folderId },
    select: {
      folderName: true,
      parsedTitle: true,
      parsedDate: true,
      parsedShortName: true,
      isVideo: true,
      fileCount: true,
      coverKey: true,
      attributions: { select: { icgId: true } },
      archiveLink: { select: { status: true, stagingSetId: true } },
    },
  })
  if (!folder) throw new Error('Archive folder not found')

  const channelIds = folder.parsedShortName
    ? (
        await prisma.channel.findMany({
          where: { shortName: { equals: folder.parsedShortName, mode: 'insensitive' } },
          select: { id: true },
        })
      ).map((c) => c.id)
    : []
  const titleNorm = normalizeForSearch(folder.parsedTitle ?? folder.folderName)
  const alias = parseFolderParticipantRaw(folder.folderName)
  const aliasNorm = alias ? normalizeForSearch(alias) : ''
  const icgIds = folder.attributions.map((a) => a.icgId)
  const suggestedId =
    folder.archiveLink?.status === 'SUGGESTED' ? (folder.archiveLink.stagingSetId ?? '') : ''
  const date = folder.parsedDate

  // One pass in SQL: similarity needs pg_trgm, and the date window, channel and
  // cast tests narrow ~40k staged sets to a handful. A candidate needs a near-equal
  // title on its own, or two weaker signals together.
  const rows = await prisma.$queryRaw<CandidateRow[]>`
    WITH c AS (
      SELECT s.*,
        similarity(coalesce(s."titleNorm", ''), ${titleNorm}) AS sim,
        CASE WHEN s."releaseDate" IS NULL OR ${date}::timestamp IS NULL THEN NULL
             ELSE abs(round(extract(epoch FROM (s."releaseDate" - ${date}::timestamp)) / 86400))::int END AS day,
        (s."channelId" = ANY(${channelIds}::text[])) AS chan,
        (s."participantIcgIds" && ${icgIds}::text[]
          OR (${aliasNorm} <> '' AND coalesce(s."participantNamesNorm", '') LIKE '%' || ${aliasNorm} || '%')) AS person,
        (s.id = ${suggestedId}) AS suggested
      FROM staging_set s
      WHERE s.id = ${suggestedId}
         OR s."titleNorm" % ${titleNorm}
         OR s."channelId" = ANY(${channelIds}::text[])
         OR s."participantIcgIds" && ${icgIds}::text[]
         OR (${date}::timestamp IS NOT NULL AND s."releaseDate" BETWEEN ${date}::timestamp - interval '3 days' AND ${date}::timestamp + interval '3 days')
    )
    SELECT c.id, c.title, c."channelName", c."releaseDate", c.status::text AS status, c."isVideo",
      c."imageCount", c."coverImageUrl", c."externalId", c.participants, c."importBatchId", c."promotedSetId",
      c.sim, c.day, coalesce(c.chan, false) AS chan, coalesce(c.person, false) AS person, c.suggested,
      lf."folderName" AS "linkedFolderName", lf."coverKey" AS "linkedFolderCoverKey"
    FROM c
    LEFT JOIN "ArchiveLink" l ON l.status = 'CONFIRMED' AND l."archiveFolderId" <> ${folderId}
      AND (l."stagingSetId" = c.id OR (c."promotedSetId" IS NOT NULL AND l."setId" = c."promotedSetId"))
    LEFT JOIN archive_folder lf ON lf.id = l."archiveFolderId"
    WHERE c.suggested
       OR (c."isVideo" = ${folder.isVideo} AND (
            -- a title alone must be close: "Presenting" vs "Presenting Neona" is 0.6
            c.sim >= 0.8
         OR (c.sim >= 0.35 AND (coalesce(c.chan, false) OR coalesce(c.person, false) OR c.day <= 31))
         OR (c.day <= 3 AND (coalesce(c.chan, false) OR coalesce(c.person, false) OR c.sim >= 0.25))
       ))
    ORDER BY c.suggested DESC,
      (c.sim * 3 + CASE WHEN c.chan THEN 1 ELSE 0 END + CASE WHEN c.person THEN 1.5 ELSE 0 END
        + CASE WHEN c.day = 0 THEN 1.5 WHEN c.day <= 3 THEN 0.5 ELSE 0 END) DESC
    LIMIT ${limit}
  `

  return {
    folder: {
      folderName: folder.folderName,
      coverUrl: folder.coverKey ? buildUrl(folder.coverKey) : null,
      releaseDate: isoDay(date),
      fileCount: folder.fileCount,
      isVideo: folder.isVideo,
    },
    candidates: rows.map((r) => ({
      id: r.id,
      title: r.title,
      channelName: r.channelName,
      releaseDate: isoDay(r.releaseDate),
      status: r.status,
      isVideo: r.isVideo,
      imageCount: r.imageCount,
      // A staged set's own cover if it is ours; else the cover of the folder it
      // already has — never a harvested publisher URL (local media only)
      coverUrl:
        localMediaUrlOrNull(r.coverImageUrl) ?? (r.linkedFolderCoverKey ? buildUrl(r.linkedFolderCoverKey) : null),
      externalId: r.externalId,
      participants: castNames(r.participants),
      fromImport: r.importBatchId !== null,
      reasons: matchReasons({ suggested: r.suggested, sim: Number(r.sim), day: r.day, chan: r.chan, person: r.person }),
      dayDistance: r.day,
      linkedFolderName: r.linkedFolderName,
      promotedSetId: r.promotedSetId,
    })),
  }
}
