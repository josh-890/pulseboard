/**
 * What the app puts on disk about who is in a set (ADR-0029, ADR-0030).
 *
 * The app cannot write to the archive — only the scan agent can — so this serves
 * two endpoints and the agent does the writing:
 *
 *   `getPeopleRevisions()` — every folder's fingerprint, so the agent can tell in one
 *                            round trip which files are out of date
 *   `getPeopleFiles(keys)` — the rendered bodies for the ones that differ
 *
 * The fingerprint is what keeps this from repeating the identity anchor's silent
 * decay: `pulseboard.json` is written once and only ever patched for a folder
 * rename, so its `setId` is wrong the moment a link is confirmed later, and nothing
 * says so.
 */
import { prisma } from '@/lib/db'
import {
  EMPTY_REVISION,
  peopleRevision,
  renderCastFile,
  type FilePerson,
} from '@/lib/archive-people-file'
import { loadCasts } from '@/lib/services/set-cast-service'

export type PeopleRevision = { archiveKey: string; revision: string }
export type PeopleFile = { archiveKey: string; body: string | null }

type FolderPeople = {
  archiveKey: string
  folderName: string
  set: { channel: string | null; releaseDate: string | null; title: string } | null
  credited: FilePerson[]
  claimed: FilePerson[]
}

const isoDay = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/**
 * Claims and cast for every folder, or for the given keys.
 *
 * Deliberately three queries and an assembly rather than one clever join: the
 * claims table is small, confirmed links number a few thousand, and the folder list
 * is wide but thin. Loading the whole thing costs a couple of MB and keeps the two
 * person-shapes (staging JSON vs. `SetParticipant`) resolved in one shared place.
 */
async function loadFolderPeople(archiveKeys?: string[]): Promise<FolderPeople[]> {
  const folders = await prisma.archiveFolder.findMany({
    where: archiveKeys ? { archiveKey: { in: archiveKeys } } : undefined,
    select: { id: true, archiveKey: true, folderName: true },
  })
  if (folders.length === 0) return []

  const folderIds = folders.map((f) => f.id)

  const [attributions, links] = await Promise.all([
    prisma.archiveFolderAttribution.findMany({
      where: { archiveFolderId: { in: folderIds } },
      select: { archiveFolderId: true, icgId: true, name: true },
      orderBy: { confirmedAt: 'asc' },
    }),
    prisma.archiveLink.findMany({
      where: { archiveFolderId: { in: folderIds }, status: 'CONFIRMED' },
      select: {
        archiveFolderId: true,
        stagingSetId: true,
        setId: true,
        stagingSet: { select: { releaseDate: true, channelName: true, channel: { select: { shortName: true } } } },
        set: { select: { releaseDate: true, channel: { select: { shortName: true } } } },
      },
    }),
  ])

  const casts = await loadCasts(
    links.map((l) => l.stagingSetId).filter((id): id is string => !!id),
    links.map((l) => l.setId).filter((id): id is string => !!id),
  )

  const claimsByFolder = new Map<string, FilePerson[]>()
  for (const a of attributions) {
    const list = claimsByFolder.get(a.archiveFolderId) ?? []
    list.push({ name: a.name, icgId: a.icgId })
    claimsByFolder.set(a.archiveFolderId, list)
  }

  const linkByFolder = new Map(links.map((l) => [l.archiveFolderId, l]))

  return folders.map((folder) => {
    const link = linkByFolder.get(folder.id)
    const targetId = link?.stagingSetId ?? link?.setId ?? null
    const entry = targetId ? casts.get(targetId) : undefined
    const channel = link?.set?.channel?.shortName ?? link?.stagingSet?.channel?.shortName ?? link?.stagingSet?.channelName ?? null
    const day = isoDay(link?.set?.releaseDate ?? link?.stagingSet?.releaseDate ?? null)

    return {
      archiveKey: folder.archiveKey,
      folderName: folder.folderName,
      set: entry ? { channel, releaseDate: day, title: entry.title } : null,
      // A cast member the import gave no ICG-ID cannot be found again by grep, and
      // an unidentifiable name is exactly what these files exist to avoid.
      credited: (entry?.cast ?? []).filter((p) => p.icgId),
      claimed: claimsByFolder.get(folder.id) ?? [],
    }
  })
}

/**
 * One fingerprint per folder, including the folders the app knows nobody for —
 * those carry `EMPTY`, which tells the agent to delete a file that has outlived its
 * content rather than leave a stale one behind.
 */
export async function getPeopleRevisions(): Promise<PeopleRevision[]> {
  const people = await loadFolderPeople()
  return people.map((p) => ({
    archiveKey: p.archiveKey,
    revision: peopleRevision(p.credited, p.claimed),
  }))
}

/** The bodies for the folders whose fingerprint differs. `null` means: delete it. */
export async function getPeopleFiles(archiveKeys: string[]): Promise<PeopleFile[]> {
  if (archiveKeys.length === 0) return []
  const people = await loadFolderPeople(archiveKeys)
  const generatedAt = new Date()
  return people.map((p) => ({
    archiveKey: p.archiveKey,
    body: renderCastFile({
      archiveKey: p.archiveKey,
      folderName: p.folderName,
      set: p.set,
      credited: p.credited,
      claimed: p.claimed,
      generatedAt,
    }),
  }))
}

/** Counts for the maintenance surface: how much the archive can answer on its own. */
export async function getPeopleFileCoverage(): Promise<{ folders: number; withPeople: number }> {
  const people = await loadFolderPeople()
  return {
    folders: people.length,
    withPeople: people.filter((p) => peopleRevision(p.credited, p.claimed) !== EMPTY_REVISION).length,
  }
}
