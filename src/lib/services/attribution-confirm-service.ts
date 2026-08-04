/**
 * Group confirmation (ADR-0027, plan slice 5) — the first code in this project
 * that writes person attribution at volume.
 *
 * What confirmation does, and deliberately does not do:
 *
 *   DOES  write an `ArchiveFolderAttribution` per (folder, person), and mint a
 *         Contact for an ICG-ID the app does not know yet.
 *   DOES NOT create a Set, a StagingSet or a Person.
 *
 * That split follows from the measured data, not from taste: only 1.7 % of the
 * 28,377 suggestions point at a Person the app already has, and 84.8 % of the
 * suggested identities are unknown entirely. Confirming in bulk is therefore an
 * act of *identity registration*, not of linking — and materialisation belongs to
 * the curated per-person import path, which this table simply lets arrive
 * pre-informed about which folders are whose.
 */
import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'
import type {
  AttributionDecision,
  FolderDevelopStatus,
  FolderIdentityStatus,
} from '@/generated/prisma/client'
import { getAttributionGroups, type AttributionGroup } from '@/lib/services/attribution-suggestion-service'
import { parseFolderParticipantRaw } from '@/lib/services/archive-service'
import { buildUrl } from '@/lib/media-url'
export { candidatesForFolder, type FolderCandidate } from '@/lib/attribution-candidates'
import { createStagingSetFromOrphan } from '@/lib/services/archive-service'
import { addStagingSetParticipant } from '@/lib/services/staging-set-participants'

export type ConfirmResult = {
  groupKey: string
  /** Folders that received at least one attribution. */
  attributedFolders: number
  attributionRows: number
  /**
   * Folders in the group that suggested none of the confirmed persons.
   *
   * Never attributed by association: in `MPL | nata` 80 folders name Nata and 3
   * name someone else entirely. Sweeping those 3 along would be the one way this
   * feature puts a person into a career they were never part of.
   */
  dissentingFolders: number
  /** Folders with no suggestion at all — untouched, still unexplained. */
  silentFolders: number
  contactsCreated: number
  personsLinked: number
}

/** Resolve an ICG-ID to a curated Person, or mint/refresh the ghost Contact. */
async function resolveIdentity(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  icgId: string,
  name: string,
): Promise<{ personId: string | null; contactId: string | null; created: boolean }> {
  const person = await tx.person.findUnique({ where: { icgId }, select: { id: true } })
  if (person) return { personId: person.id, contactId: null, created: false }

  const existing = await tx.contact.findUnique({ where: { icgId }, select: { id: true } })
  if (existing) return { personId: null, contactId: existing.id, created: false }

  // `source: 'import'` — the enum has only import|manual, and this identity did
  // come from an import file (the catalogue's), just by way of the archive.
  const contact = await tx.contact.create({
    data: { icgId, name, nameNorm: normalizeForSearch(name), source: 'import' },
    select: { id: true },
  })
  return { personId: null, contactId: contact.id, created: true }
}

export type GroupMember = {
  id: string
  suggestions: { icgId: string; name: string }[]
}

export type AttributionPlan = {
  /** folderId → the confirmed ICG-IDs that folder actually suggested. */
  perFolder: Map<string, string[]>
  /** Folders that suggested someone, but none of the confirmed people. */
  dissenting: string[]
  /** Folders with no suggestion at all. */
  silent: string[]
}

/**
 * Decide what a confirmation writes — pure, so the one rule that keeps this
 * feature safe is testable without a database.
 *
 * **A folder is attributed to exactly the confirmed people it itself suggested.**
 * Never to the group's verdict as such. In `MPL | nata` 80 folders name Nata and
 * 3 name someone else; sweeping those 3 along on the group's say-so is the one
 * way this feature could put a person into a career they were never part of.
 * They are counted and left for individual review instead.
 */
export function planAttributions(members: GroupMember[], icgIds: string[]): AttributionPlan {
  const wanted = new Set(icgIds)
  const perFolder = new Map<string, string[]>()
  const dissenting: string[] = []
  const silent: string[] = []

  for (const m of members) {
    if (m.suggestions.length === 0) {
      silent.push(m.id)
      continue
    }
    const matching = [...new Set(m.suggestions.map((s) => s.icgId))].filter((i) => wanted.has(i))
    if (matching.length === 0) dissenting.push(m.id)
    else perFolder.set(m.id, matching)
  }

  return { perFolder, dissenting, silent }
}

/** The display name for each confirmed person, taken from the suggestions carrying them. */
export function namesForConfirmation(members: GroupMember[], icgIds: string[]): Map<string, string> {
  const wanted = new Set(icgIds)
  const nameOf = new Map<string, string>()
  for (const m of members) {
    for (const s of m.suggestions) {
      if (wanted.has(s.icgId) && !nameOf.has(s.icgId)) nameOf.set(s.icgId, s.name)
    }
  }
  // An ICG-ID nobody named still gets confirmed — it just has no better label.
  for (const icgId of icgIds) if (!nameOf.has(icgId)) nameOf.set(icgId, icgId)
  return nameOf
}

/** The folders behind a `SHORT|alias` key. Recomputed, never stored — the key is derived. */
async function membersOfGroup(groupKey: string): Promise<GroupMember[]> {
  const [short] = groupKey.split('|')
  const rows = await prisma.archiveFolder.findMany({
    where: {
      missingOnDisk: false,
      archiveLink: null,
      ...(short === '?' ? { parsedShortName: null } : { parsedShortName: { equals: short, mode: 'insensitive' } }),
    },
    select: {
      id: true,
      folderName: true,
      parsedShortName: true,
      suggestions: { select: { icgId: true, name: true } },
    },
  })
  return rows
    .filter((r) => {
      const alias = normalizeForSearch(parseFolderParticipantRaw(r.folderName) ?? '')
      return `${(r.parsedShortName ?? '?').toUpperCase()}|${alias}` === groupKey
    })
    .map((r) => ({ id: r.id, suggestions: r.suggestions }))
}

/**
 * Confirm ONE folder as the given people — the unit of decision.
 *
 * The group-level confirm this replaces could attach a person to 204 folders at
 * once, and `AA | Anna` proved the group mixes distinct people under one alias.
 * The same failure is documented in Apple Photos, where confirming a single face
 * pulls in look-alikes and merges two people into one album, and FamilySearch —
 * the closest analogue in kind and in stakes — offers no bulk accept at all.
 *
 * Multi-folder confirmation still exists, but only through
 * `confirmFoldersIdentity` over a selection the operator built by hand. Nothing
 * is ever pre-selected.
 */
export async function confirmFolderIdentity(
  folderId: string,
  icgIds: string[],
  names?: Record<string, string>,
): Promise<ConfirmResult> {
  return confirmFoldersIdentity([folderId], icgIds, names)
}

/**
 * Confirm a hand-built selection of folders as the given people.
 *
 * Unlike the group confirm it replaces, every folder here was individually
 * selected, so attribution is unconditional: the operator has already said "these
 * ones". The safety property moves from the write to the selection.
 */
export async function confirmFoldersIdentity(
  folderIds: string[],
  icgIds: string[],
  names?: Record<string, string>,
): Promise<ConfirmResult> {
  if (icgIds.length === 0) throw new Error('Confirming needs at least one person')
  if (folderIds.length === 0) throw new Error('Confirming needs at least one folder')

  const folders = await prisma.archiveFolder.findMany({
    where: { id: { in: folderIds } },
    select: { id: true, suggestions: { select: { icgId: true, name: true } } },
  })
  if (folders.length === 0) throw new Error('No such folder')

  // A name may come from the caller (the picker knows it), otherwise from the
  // folder's own suggestions, otherwise the ICG-ID stands for itself.
  const nameOf = namesForConfirmation(
    folders.map((f) => ({ id: f.id, suggestions: f.suggestions })),
    icgIds,
  )
  for (const [icgId, name] of Object.entries(names ?? {})) {
    if (name) nameOf.set(icgId, name)
  }

  return prisma.$transaction(async (tx) => {
    const identity = new Map<string, { personId: string | null; contactId: string | null }>()
    let contactsCreated = 0
    let personsLinked = 0
    for (const icgId of icgIds) {
      const r = await resolveIdentity(tx, icgId, nameOf.get(icgId)!)
      identity.set(icgId, { personId: r.personId, contactId: r.contactId })
      if (r.created) contactsCreated++
      if (r.personId) personsLinked++
    }

    let attributionRows = 0
    for (const f of folders) {
      for (const icgId of icgIds) {
        const id = identity.get(icgId)!
        // Upsert: re-confirming after an undo must converge rather than throw.
        await tx.archiveFolderAttribution.upsert({
          where: { archiveFolderId_icgId: { archiveFolderId: f.id, icgId } },
          create: {
            archiveFolderId: f.id,
            icgId,
            name: nameOf.get(icgId)!,
            personId: id.personId,
            contactId: id.contactId,
          },
          update: { personId: id.personId, contactId: id.contactId, name: nameOf.get(icgId)! },
        })
        attributionRows++
      }
      await setReview(tx, f.id, { identity: 'CONFIRMED' })
    }

    return {
      groupKey: '',
      attributedFolders: folders.length,
      attributionRows,
      dissentingFolders: 0,
      silentFolders: 0,
      contactsCreated,
      personsLinked,
    }
  })
}

/** Write the per-folder review state, creating the row on first touch. */
async function setReview(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  folderId: string,
  data: { identity?: FolderIdentityStatus; develop?: FolderDevelopStatus },
): Promise<void> {
  const now = new Date()
  await tx.archiveFolderReview.upsert({
    where: { archiveFolderId: folderId },
    create: {
      archiveFolderId: folderId,
      ...(data.identity ? { identity: data.identity, identityAt: now } : {}),
      ...(data.develop ? { develop: data.develop, developAt: now } : {}),
    },
    update: {
      ...(data.identity ? { identity: data.identity, identityAt: now } : {}),
      ...(data.develop ? { develop: data.develop, developAt: now } : {}),
    },
  })
}

/**
 * "Not this person" — the folder leaves the open queue without an attribution.
 *
 * Rejecting is not the same as skipping: reject records a judgement (the
 * suggestion is wrong), skip records a deferral. Both remove the folder from the
 * open list, and neither writes an attribution.
 */
export async function rejectFolderIdentity(folderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: folderId } })
    await setReview(tx, folderId, { identity: 'REJECTED' })
  })
}

export async function skipFolderIdentity(folderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await setReview(tx, folderId, { identity: 'SKIPPED' })
  })
}

/**
 * Undo one folder's identity decision.
 *
 * digiKam's People view has no undo for a wrong confirm and its users say so; a
 * keyboard that writes on a single keystroke has no business lacking one.
 */
export async function undoFolderIdentity(folderId: string): Promise<{ removedAttributions: number }> {
  return prisma.$transaction(async (tx) => {
    const removed = await tx.archiveFolderAttribution.deleteMany({ where: { archiveFolderId: folderId } })
    await tx.archiveFolderReview.deleteMany({ where: { archiveFolderId: folderId } })
    return { removedAttributions: removed.count }
  })
}

/**
 * Rule a group out without attributing anyone.
 *
 * `NOT_A_PERSON` is not polish. The single largest group in the archive is
 * `W4B | w4b magazine` — 204 folders whose "alias" is a magazine title — and
 * `MPL | mpl studios` is the channel's own name. Without a way to say so, those
 * sit at the top of the queue forever.
 */
export async function decideAttributionGroup(
  groupKey: string,
  decision: Extract<AttributionDecision, 'NOT_A_PERSON' | 'SKIPPED'>,
  note?: string,
): Promise<{ groupKey: string; folderCount: number }> {
  const members = await membersOfGroup(groupKey)
  await prisma.attributionGroupDecision.upsert({
    where: { groupKey },
    create: { groupKey, decision, icgIds: [], folderCount: members.length, note: note ?? null },
    update: { decision, icgIds: [], folderCount: members.length, note: note ?? null },
  })
  return { groupKey, folderCount: members.length }
}

/**
 * Undo a decision: drop the verdict and every attribution it wrote.
 *
 * Contacts minted along the way are deliberately kept. They are a deduplicated
 * ghost register keyed on ICG-ID, harmless when unreferenced, and deleting one
 * could strip edges another confirmation or import has since attached to it.
 */
export async function undoAttributionGroup(groupKey: string): Promise<{ removedAttributions: number }> {
  return prisma.$transaction(async (tx) => {
    const removed = await tx.archiveFolderAttribution.deleteMany({ where: { groupKey } })
    await tx.attributionGroupDecision.deleteMany({ where: { groupKey } })
    return { removedAttributions: removed.count }
  })
}

export type AttributionQueueGroup = AttributionGroup & {
  decision: AttributionDecision | null
  decidedIcgIds: string[]
  /** Folders in the group that already carry an attribution. */
  attributedFolders: number
  /** Folders nobody has ruled on yet — the actual work left in this group. */
  openFolders: number
}

export type AttributionQueue = {
  groups: AttributionQueueGroup[]
  counts: {
    total: number
    open: number
    unanimous: number
    conflicted: number
    silent: number
    decided: number
    notAPerson: number
    /** Folders still awaiting a decision, across every group. */
    openFolders: number
  }
}

/**
 * The work queue, ordered by leverage (folder count).
 *
 * Decided groups are filtered out by default rather than deleted: a decision must
 * survive the agent's next run, which rewrites every suggestion.
 */
export type AttributionView = 'open' | 'conflicted' | 'decided'

export async function getAttributionQueue(
  opts: { limit?: number; view?: AttributionView } = {},
): Promise<AttributionQueue> {
  const [groups, decisions, reviewed] = await Promise.all([
    getAttributionGroups(),
    prisma.attributionGroupDecision.findMany({
      select: { groupKey: true, decision: true, icgIds: true },
    }),
    // Per-folder progress is what the row reports now, so the operator can see at
    // a glance which groups still hold work rather than which were "confirmed".
    prisma.archiveFolderReview.findMany({
      where: { identity: { not: 'OPEN' } },
      select: { archiveFolderId: true, identity: true },
    }),
  ])

  const decisionOf = new Map(decisions.map((d) => [d.groupKey, d]))
  const ruledOn = new Set(reviewed.map((r) => r.archiveFolderId))
  const confirmed = new Set(reviewed.filter((r) => r.identity === 'CONFIRMED').map((r) => r.archiveFolderId))

  const enriched: AttributionQueueGroup[] = groups.map((g) => {
    const d = decisionOf.get(g.key)
    return {
      ...g,
      decision: d?.decision ?? null,
      decidedIcgIds: d?.icgIds ?? [],
      attributedFolders: g.folderIds.filter((id) => confirmed.has(id)).length,
      openFolders: g.folderIds.filter((id) => !ruledOn.has(id)).length,
    }
  })

  const isOpen = (g: AttributionQueueGroup) => !g.decision && g.openFolders > 0
  const counts = {
    total: enriched.length,
    open: enriched.filter(isOpen).length,
    unanimous: enriched.filter((g) => isOpen(g) && g.votedFolders > 0 && g.unanimous).length,
    conflicted: enriched.filter((g) => isOpen(g) && g.votedFolders > 0 && !g.unanimous).length,
    silent: enriched.filter((g) => isOpen(g) && g.votedFolders === 0).length,
    decided: enriched.filter((g) => !isOpen(g)).length,
    notAPerson: enriched.filter((g) => g.decision === 'NOT_A_PERSON').length,
    openFolders: enriched.reduce((n, g) => n + (g.decision ? 0 : g.openFolders), 0),
  }

  const view = opts.view ?? 'open'
  const visible =
    view === 'decided'
      ? enriched.filter((g) => !isOpen(g))
      : view === 'conflicted'
        ? enriched.filter((g) => isOpen(g) && g.votedFolders > 0 && !g.unanimous)
        : enriched.filter(isOpen)

  return { groups: opts.limit ? visible.slice(0, opts.limit) : visible, counts }
}

/**
 * Folders in a group, with cover and current attribution — the confirmation view.
 *
 * `coverUrl` is resolved HERE, server-side. `buildUrl` reads the tenant bucket
 * through AsyncLocalStorage, so handing a client component the raw key and
 * letting it build the URL drags `node:async_hooks` into the browser bundle and
 * 500s the page — a mistake this codebase has already made once.
 */
export async function getGroupFolders(groupKey: string): Promise<
  {
    id: string
    folderName: string
    fullPath: string
    coverUrl: string | null
    isVideo: boolean
    suggestions: { icgId: string; name: string; tier: string; demotions: string[] }[]
    attributions: { icgId: string; name: string }[]
    identity: FolderIdentityStatus
  }[]
> {
  const [short] = groupKey.split('|')
  const rows = await prisma.archiveFolder.findMany({
    where: {
      missingOnDisk: false,
      archiveLink: null,
      ...(short === '?' ? { parsedShortName: null } : { parsedShortName: { equals: short, mode: 'insensitive' } }),
    },
    select: {
      id: true,
      folderName: true,
      fullPath: true,
      parsedShortName: true,
      coverKey: true,
      isVideo: true,
      suggestions: { select: { icgId: true, name: true, tier: true, demotions: true } },
      attributions: { select: { icgId: true, name: true } },
      review: { select: { identity: true } },
    },
    orderBy: { folderName: 'asc' },
  })
  return rows
    .filter((r) => {
      const alias = normalizeForSearch(parseFolderParticipantRaw(r.folderName) ?? '')
      return `${(r.parsedShortName ?? '?').toUpperCase()}|${alias}` === groupKey
    })
    .map(({ parsedShortName: _short, coverKey, review, ...r }) => ({
      ...r,
      identity: review?.identity ?? ('OPEN' as FolderIdentityStatus),
      coverUrl: coverKey ? buildUrl(coverKey) : null,
    }))
}

export type DevelopCandidate = {
  id: string
  folderName: string
  fullPath: string
  coverUrl: string | null
  isVideo: boolean
  parsedDate: Date | null
  parsedShortName: string | null
  parsedTitle: string | null
}

export type DevelopPerson = {
  icgId: string
  name: string
  personId: string | null
  contactId: string | null
  folders: DevelopCandidate[]
}

/**
 * Stage 2 (plan slice 6): confirmed folders that have no staging set yet.
 *
 * Grouped by PERSON, not by channel, because the question here is about a person
 * — "do I want their sets in the app now, or wait for their import file?" — while
 * stage 1's question was about a channel's alias. Different question, different
 * grouping, separate pass: splitting compound questions this way is what the
 * annotation research measured as the throughput win.
 */
export async function getDevelopQueue(opts: { limit?: number } = {}): Promise<DevelopPerson[]> {
  const rows = await prisma.archiveFolderAttribution.findMany({
    where: {
      archiveFolder: { missingOnDisk: false, archiveLink: null },
      OR: [{ archiveFolder: { review: null } }, { archiveFolder: { review: { develop: 'PENDING' } } }],
    },
    select: {
      icgId: true,
      name: true,
      personId: true,
      contactId: true,
      archiveFolder: {
        select: {
          id: true,
          folderName: true,
          fullPath: true,
          coverKey: true,
          isVideo: true,
          parsedDate: true,
          parsedShortName: true,
          parsedTitle: true,
        },
      },
    },
    orderBy: { archiveFolder: { folderName: 'asc' } },
  })

  const byPerson = new Map<string, DevelopPerson>()
  for (const r of rows) {
    let p = byPerson.get(r.icgId)
    if (!p) {
      p = { icgId: r.icgId, name: r.name, personId: r.personId, contactId: r.contactId, folders: [] }
      byPerson.set(r.icgId, p)
    }
    const f = r.archiveFolder
    p.folders.push({
      id: f.id,
      folderName: f.folderName,
      fullPath: f.fullPath,
      coverUrl: f.coverKey ? buildUrl(f.coverKey) : null,
      isVideo: f.isVideo,
      parsedDate: f.parsedDate,
      parsedShortName: f.parsedShortName,
      parsedTitle: f.parsedTitle,
    })
  }

  const out = [...byPerson.values()].sort((a, b) => b.folders.length - a.folders.length)
  return opts.limit ? out.slice(0, opts.limit) : out
}

/**
 * Develop one confirmed folder into a StagingSet with its participant attached.
 *
 * Reuses the paths that already exist: `createStagingSetFromOrphan` builds the
 * set and the CONFIRMED archive link, and the participant is written with its
 * ICG-ID so slice 2's promote path can carry the identity through to a Contact
 * credit even though the person is not curated yet.
 */
export async function developFolder(
  folderId: string,
): Promise<{ stagingSetId: string; participants: number }> {
  const attributions = await prisma.archiveFolderAttribution.findMany({
    where: { archiveFolderId: folderId },
    select: { icgId: true, name: true, personId: true },
  })
  if (attributions.length === 0) {
    throw new Error('Only a confirmed folder can be developed')
  }

  const { stagingSetId } = await createStagingSetFromOrphan(folderId)

  // Participants are written through the staging service's own shape so the
  // derived fields (participantIcgIds, participantNamesNorm, statuses) stay
  // consistent with every other path that touches a staging set.
  for (const a of attributions) {
    await addStagingSetParticipant(stagingSetId, {
      name: a.name,
      icgId: a.icgId,
      ...(a.personId ? { personId: a.personId } : {}),
    })
  }

  await prisma.$transaction(async (tx) => {
    await setReview(tx, folderId, { develop: 'DEVELOPED' })
  })
  return { stagingSetId, participants: attributions.length }
}

/** Park a confirmed folder: the set will arrive via the person's import instead. */
export async function waitOnFolder(folderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await setReview(tx, folderId, { develop: 'WAITING' })
  })
}
