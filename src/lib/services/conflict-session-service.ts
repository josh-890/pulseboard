/**
 * The contradiction session: one folder at a time, both claims side by side.
 *
 * A folder carries **claims**, a set has a **cast** (ADR-0028). Where the two
 * disagree, neither is automatically right — an import list can be incomplete,
 * and a folder attribution is the archive owner's own assertion — so the app
 * refuses to pick and asks instead.
 *
 * It asks *here*, in the workbench shell, rather than in the maintenance list,
 * because the question is "which of these two is the person on this cover?" and
 * answering that from two lines of text is exactly the mistake to avoid. The
 * cover, the claimed person's face and the cast's faces all have to be on screen
 * together.
 *
 * The session is **derived**, not stored: `getAttributionLinkAudit()` recomputes
 * it from the current data, and every answer changes that data, so a decided
 * folder simply stops appearing. There is no queue table to keep in step.
 */
import { prisma } from '@/lib/db'
import { buildUrl } from '@/lib/media-url'
import { getAttributionLinkAudit } from '@/lib/services/maintenance-service'
import { resolvePersonReferences, type PersonReference } from '@/lib/services/person-reference-service'
import { loadCasts } from '@/lib/services/set-cast-service'

export type ConflictPerson = { icgId: string; name: string }

export type ConflictFolder = {
  /** One row per contradicting claim — a folder with two contested claims appears twice. */
  id: string
  folderId: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  /** The person you attributed, whom the cast does not name. */
  claim: ConflictPerson
  /** How many claims this folder still holds — the last one to go closes its identity. */
  claimsOnFolder: number
  target: {
    kind: 'staging' | 'set'
    id: string
    title: string
    /** Who the set credits. Never empty — an empty cast is not a contradiction. */
    cast: ConflictPerson[]
  }
}

export type ConflictSession = {
  folders: ConflictFolder[]
  /** Faces for everyone on screen: the claim and the whole cast. */
  references: PersonReference[]
}

export async function getConflictSession(): Promise<ConflictSession> {
  const { conflicts } = await getAttributionLinkAudit()
  if (conflicts.length === 0) return { folders: [], references: [] }

  const folderIds = [...new Set(conflicts.map((c) => c.folderId))]
  const stagingIds = [...new Set(conflicts.filter((c) => c.kind === 'staging').map((c) => c.targetId))]
  const setIds = [...new Set(conflicts.filter((c) => c.kind === 'set').map((c) => c.targetId))]

  const [folders, claimCounts, casts] = await Promise.all([
    prisma.archiveFolder.findMany({
      where: { id: { in: folderIds } },
      // coverUrl is resolved HERE: buildUrl reads the tenant bucket through
      // AsyncLocalStorage, so handing a client component the raw key drags
      // node:async_hooks into the browser bundle.
      select: { id: true, folderName: true, fullPath: true, isVideo: true, coverKey: true },
    }),
    prisma.archiveFolderAttribution.groupBy({
      by: ['archiveFolderId'],
      where: { archiveFolderId: { in: folderIds } },
      _count: { _all: true },
    }),
    // Both cast shapes — staging JSON and the SetParticipant cache — resolved by the
    // reader the people files on disk use too (ADR-0029).
    loadCasts(stagingIds, setIds),
  ])

  const folderById = new Map(folders.map((f) => [f.id, f]))
  const claimsById = new Map(claimCounts.map((c) => [c.archiveFolderId, c._count._all]))

  const rows: ConflictFolder[] = []
  for (const c of conflicts) {
    const folder = folderById.get(c.folderId)
    if (!folder) continue
    rows.push({
      id: `${c.folderId}:${c.attributedIcgId}`,
      folderId: c.folderId,
      folderName: folder.folderName,
      fullPath: folder.fullPath,
      coverUrl: folder.coverKey ? buildUrl(folder.coverKey) : null,
      isVideo: folder.isVideo,
      claim: { icgId: c.attributedIcgId, name: c.attributedName },
      claimsOnFolder: claimsById.get(c.folderId) ?? 1,
      target: {
        kind: c.kind,
        id: c.targetId,
        title: casts.get(c.targetId)?.title ?? c.targetTitle,
        cast: casts.get(c.targetId)?.cast ?? [],
      },
    })
  }

  // Faces for both sides. Deciding "is the woman on this cover the one I claimed,
  // or one of the two the import credits?" is a visual question, and a name is
  // not an answer to it.
  const icgIds = [
    ...new Set(rows.flatMap((r) => [r.claim.icgId, ...r.target.cast.map((p) => p.icgId)]).filter(Boolean)),
  ]
  const refs = await resolvePersonReferences(icgIds)

  // Sent as an array: a Map does not survive the server/client boundary.
  return { folders: rows, references: [...refs.values()] }
}

/**
 * What the operator can answer, and what each answer means in data.
 *
 * There is deliberately no fourth answer for "both are right, leave it". The
 * session is derived from the data, so a row can only disappear by something
 * actually changing — which is the price of having no queue table (ADR-0028).
 */
export type ConflictAnswer =
  /** The set is right: the claim was mine and it was wrong. */
  | 'import-right'
  /** I am right: the cast was incomplete, so add the person to it. */
  | 'claim-right'
  /** Neither — this folder is not that set at all. */
  | 'wrong-link'

export type ConflictResolution = { resolved: boolean; handOffToSetId?: string }

export async function resolveConflict(
  folderId: string,
  icgId: string,
  answer: ConflictAnswer,
): Promise<ConflictResolution> {
  if (answer === 'import-right') {
    // `rejectCandidate` already does exactly this: the attribution goes, the
    // person joins rejectedIcgIds so no later pass proposes them here again, and
    // the folder's identity closes only when the last claim is gone.
    const claims = await prisma.archiveFolderAttribution.count({ where: { archiveFolderId: folderId } })
    const { rejectCandidate } = await import('@/lib/services/attribution-confirm-service')
    await rejectCandidate(folderId, icgId, claims)
    return { resolved: true }
  }

  if (answer === 'wrong-link') {
    // The claim survives untouched: it was never about the set, it was about the
    // folder. Losing the link puts the folder back in the attribution population.
    const { unlinkArchiveFolder } = await import('@/lib/services/archive-service')
    await unlinkArchiveFolder(folderId)
    return { resolved: true }
  }

  const link = await prisma.archiveLink.findUnique({
    where: { archiveFolderId: folderId },
    select: { stagingSetId: true, setId: true },
  })

  if (link?.stagingSetId) {
    const attribution = await prisma.archiveFolderAttribution.findFirst({
      where: { archiveFolderId: folderId, icgId },
      select: { name: true, personId: true },
    })
    if (!attribution) return { resolved: false }
    const { addStagingSetParticipant } = await import('@/lib/services/staging-set-participants')
    await addStagingSetParticipant(link.stagingSetId, {
      name: attribution.name,
      icgId,
      ...(attribution.personId ? { personId: attribution.personId } : {}),
    })
    return { resolved: true }
  }

  // A promoted Set's cast is not writable from here: `SetParticipant` is a cache
  // rebuilt from `SessionContribution`, so adding someone means a credit with a
  // role on a session — a curation act, not a keystroke. The session hands over
  // to the set instead of faking it (ADR-0028).
  return { resolved: false, handOffToSetId: link?.setId ?? undefined }
}
