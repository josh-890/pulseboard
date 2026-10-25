import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { normalizeForSearch } from '@/lib/normalize'
import { archiveKeyDays, type ArchiveKeyDayKind } from '@/lib/archive-key'
import {
  folderPersonMatches,
  HIGH_TITLE_THRESHOLD,
  parseFolderParticipant,
  sameLabelChannelCodes,
} from '@/lib/services/archive-service'

// The folders sharing a staged set's archive key — its day and channel, with the
// channel's Label siblings — plus the near misses a date slip produces (±2 days,
// day and month swapped). The matcher has to guess from title and name, which
// drift; the key rarely does, so the list is short and the right folder is
// usually in it (2026-10-25). One indexed lookup on (parsedDate, parsedShortName).

export type ArchiveKeyFolder = {
  id: string
  folderName: string
  fileCount: number | null
  kind: ArchiveKeyDayKind
  /** Folder day minus the set's day; 0 for the same day and a swap */
  offset: number
  /** The folder's person matches somebody this set credits */
  personMatches: boolean
  /** The folder's title is close to the set's (trigram ≥ the HIGH floor) */
  titleMatches: boolean
  /** Whose the folder is now */
  link:
    | { state: 'free' }
    | { state: 'suggested' | 'confirmed'; here: boolean; targetTitle: string | null }
}

/** A staged set or Set released under the same key — the other side of the day. */
export type ArchiveKeyEntity = {
  id: string
  kind: 'staged' | 'set'
  title: string
  /** The staged set's status; null for a Set */
  status: string | null
  /** `Name (ICG-ID)`, or the name alone when the import gave none */
  people: string[]
  /** The set the popover was opened on (or its promoted Set) */
  here: boolean
  folder: { name: string; state: 'suggested' | 'confirmed' } | null
}

export type ArchiveKeyView = {
  /** The set's key as the archive writes it: YYYY-MM-DD-CODE */
  key: string | null
  /** The set already has a confirmed folder: nothing more can be linked */
  hasConfirmed: boolean
  folders: ArchiveKeyFolder[]
  /** Every staged set and Set with the same day and channel, this one included */
  sets: ArchiveKeyEntity[]
}

type EntityRow = {
  id: string
  title: string
  status: string | null
  participants: unknown
  link_status: 'SUGGESTED' | 'CONFIRMED' | null
  folder_name: string | null
}

/** `Name (ICG-ID)` from a staged set's imported participants. */
function stagedPeople(participants: unknown): string[] {
  if (!Array.isArray(participants)) return []
  return participants.flatMap((p: unknown) => {
    if (!p || typeof p !== 'object') return []
    const { name, icgId } = p as { name?: unknown; icgId?: unknown }
    if (typeof name !== 'string' || !name) return []
    return [typeof icgId === 'string' && icgId ? `${name} (${icgId})` : name]
  })
}

const entityFolder = (r: EntityRow): ArchiveKeyEntity['folder'] =>
  r.link_status && r.folder_name
    ? { name: r.folder_name, state: r.link_status === 'CONFIRMED' ? 'confirmed' : 'suggested' }
    : null

type Row = {
  id: string
  folder_name: string
  file_count: number | null
  day: string
  sim: number
  link_status: 'SUGGESTED' | 'CONFIRMED' | null
  link_staging_id: string | null
  link_set_id: string | null
  target_title: string | null
}

export async function getArchiveKeyFolders(stagingSetId: string, tenant: string): Promise<ArchiveKeyView> {
  const ss = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    select: {
      title: true,
      titleNorm: true,
      releaseDate: true,
      isVideo: true,
      status: true,
      promotedSetId: true,
      participantNamesNorm: true,
      participantIcgIds: true,
      channel: { select: { shortName: true } },
    },
  })
  const shortName = ss?.channel?.shortName ?? null
  if (!ss || !ss.releaseDate || !shortName) return { key: null, hasConfirmed: false, folders: [], sets: [] }

  // After promotion the archive link lives on the Set
  const targetSetId = ss.status === 'PROMOTED' ? ss.promotedSetId : null
  const days = archiveKeyDays(ss.releaseDate)
  const dayInfo = new Map(days.map((d) => [d.day, d]))
  const ranges = days.map((d) => {
    const start = new Date(`${d.day}T00:00:00.000Z`)
    const end = new Date(start.getTime() + 86_400_000)
    return Prisma.sql`(af."parsedDate" >= ${start} AND af."parsedDate" < ${end})`
  })
  const titleNorm = ss.titleNorm ?? normalizeForSearch(ss.title)
  const codes = sameLabelChannelCodes(Prisma.sql`${shortName}`)
  const dayStart = new Date(`${days[0]!.day}T00:00:00.000Z`)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  // A link's folder: the confirmed one if there is one
  const linkOf = (id: Prisma.Sql, fk: '"stagingSetId"' | '"setId"') => Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT al.status::text AS link_status, af."folderName" AS folder_name
      FROM "ArchiveLink" al JOIN archive_folder af ON af.id = al."archiveFolderId"
      WHERE al.${Prisma.raw(fk)} = ${id}
      ORDER BY (al.status = 'CONFIRMED') DESC
      LIMIT 1
    ) l ON true`

  const [rows, confirmedCount, aliases, stagedRows, setRows] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT af.id,
             af."folderName" AS folder_name,
             af."fileCount" AS file_count,
             to_char(af."parsedDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             similarity(${titleNorm}, lower(unaccent(COALESCE(af."parsedTitle", '')))) AS sim,
             al.status::text AS link_status,
             al."stagingSetId" AS link_staging_id,
             al."setId" AS link_set_id,
             COALESCE(ls.title, s.title) AS target_title
      FROM archive_folder af
      LEFT JOIN "ArchiveLink" al ON al."archiveFolderId" = af.id
      LEFT JOIN staging_set ls ON ls.id = al."stagingSetId"
      LEFT JOIN "Set" s ON s.id = al."setId"
      WHERE af.tenant = ${tenant}
        AND af."isVideo" = ${ss.isVideo}
        AND af."missingOnDisk" = false
        AND LOWER(af."parsedShortName") IN (${sameLabelChannelCodes(Prisma.sql`${shortName}`)})
        AND (${Prisma.join(ranges, ' OR ')})
      LIMIT 100
    `,
    prisma.archiveLink.count({
      where: {
        status: 'CONFIRMED',
        ...(targetSetId ? { setId: targetSetId } : { stagingSetId }),
      },
    }),
    ss.participantIcgIds.length
      ? prisma.personAlias.findMany({
          where: { nameNorm: { not: null }, person: { icgId: { in: ss.participantIcgIds } } },
          select: { nameNorm: true },
        })
      : Promise.resolve([]),
    // The staged sets of the day; a promoted one is listed as its Set
    prisma.$queryRaw<EntityRow[]>`
      SELECT ss.id, ss.title, ss.status::text AS status, ss.participants, l.link_status, l.folder_name
      FROM staging_set ss
      JOIN "Channel" c ON c.id = ss."channelId"
      ${linkOf(Prisma.sql`ss.id`, '"stagingSetId"')}
      WHERE LOWER(c."shortName") IN (${codes})
        AND ss."releaseDate" >= ${dayStart} AND ss."releaseDate" < ${dayEnd}
        AND ss."isVideo" = ${ss.isVideo}
        AND ss.status <> 'PROMOTED'
      ORDER BY ss.title
      LIMIT 50
    `,
    prisma.$queryRaw<EntityRow[]>`
      SELECT s.id, s.title, NULL AS status,
             (SELECT json_agg(json_build_object('name', COALESCE(pa.name, p."icgId"), 'icgId', p."icgId"))
                FROM "SetParticipant" sp
                JOIN "Person" p ON p.id = sp."personId"
                LEFT JOIN "PersonAlias" pa ON pa."personId" = p.id AND pa."isCommon" = true
               WHERE sp."setId" = s.id) AS participants,
             l.link_status, l.folder_name
      FROM "Set" s
      JOIN "Channel" c ON c.id = s."channelId"
      ${linkOf(Prisma.sql`s.id`, '"setId"')}
      WHERE LOWER(c."shortName") IN (${codes})
        AND s."releaseDate" >= ${dayStart} AND s."releaseDate" < ${dayEnd}
        AND s.type = ${ss.isVideo ? 'video' : 'photo'}::"SetType"
      ORDER BY s.title
      LIMIT 50
    `,
  ])

  const names = [
    ...(ss.participantNamesNorm ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    ...aliases.map((a) => a.nameNorm!).filter(Boolean),
  ]

  const folders = rows.flatMap((r): ArchiveKeyFolder[] => {
    const info = dayInfo.get(r.day)
    if (!info) return []
    const here = targetSetId ? r.link_set_id === targetSetId : r.link_staging_id === stagingSetId
    return [{
      id: r.id,
      folderName: r.folder_name,
      fileCount: r.file_count,
      kind: info.kind,
      offset: info.offset,
      personMatches: folderPersonMatches(parseFolderParticipant(r.folder_name), names),
      titleMatches: Number(r.sim) >= HIGH_TITLE_THRESHOLD,
      link: r.link_status
        ? { state: r.link_status === 'CONFIRMED' ? 'confirmed' : 'suggested', here, targetTitle: r.target_title }
        : { state: 'free' },
    }]
  })

  // The same day first, then what agrees most, then the closest day
  const KIND_ORDER: Record<ArchiveKeyDayKind, number> = { same: 0, near: 1, swapped: 2 }
  folders.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      Number(b.personMatches) + Number(b.titleMatches) - (Number(a.personMatches) + Number(a.titleMatches)) ||
      Math.abs(a.offset) - Math.abs(b.offset) ||
      a.folderName.localeCompare(b.folderName),
  )

  const sets: ArchiveKeyEntity[] = [
    ...stagedRows.map((r): ArchiveKeyEntity => ({
      id: r.id,
      kind: 'staged',
      title: r.title,
      status: r.status,
      people: stagedPeople(r.participants),
      here: r.id === stagingSetId,
      folder: entityFolder(r),
    })),
    ...setRows.map((r): ArchiveKeyEntity => ({
      id: r.id,
      kind: 'set',
      title: r.title,
      status: null,
      people: stagedPeople(r.participants),
      here: r.id === targetSetId,
      folder: entityFolder(r),
    })),
  ]
  // This set first, then the ones still without a folder
  sets.sort((a, b) => Number(b.here) - Number(a.here) || Number(!!a.folder) - Number(!!b.folder) || a.title.localeCompare(b.title))

  const key = `${ss.releaseDate.toISOString().slice(0, 10)}-${shortName}`
  return { key, hasConfirmed: confirmedCount > 0, folders, sets }
}
