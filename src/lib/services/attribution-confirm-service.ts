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
import type { AttributionDecision } from '@/generated/prisma/client'
import { getAttributionGroups, type AttributionGroup } from '@/lib/services/attribution-suggestion-service'
import { parseFolderParticipantRaw } from '@/lib/services/archive-service'
import { buildUrl } from '@/lib/media-url'

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
 * Confirm a group as the given people.
 *
 * A folder is attributed to exactly the confirmed persons **it itself suggested**.
 * That rule is what makes a confirmation safe on a group that is not unanimous:
 * the majority is written, the dissenters are counted and left for individual
 * review rather than being carried along by the group's verdict.
 */
export async function confirmAttributionGroup(
  groupKey: string,
  icgIds: string[],
): Promise<ConfirmResult> {
  if (icgIds.length === 0) throw new Error('Confirming a group needs at least one person')

  const members = await membersOfGroup(groupKey)
  if (members.length === 0) throw new Error(`Group ${groupKey} has no folders`)

  const nameOf = namesForConfirmation(members, icgIds)
  const plan = planAttributions(members, icgIds)

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
    for (const [folderId, matching] of plan.perFolder) {
      for (const icgId of matching) {
        const id = identity.get(icgId)!
        // Upsert, not create: re-confirming a group after an undo, or after the
        // agent added a person to a folder, must converge rather than throw.
        await tx.archiveFolderAttribution.upsert({
          where: { archiveFolderId_icgId: { archiveFolderId: folderId, icgId } },
          create: {
            archiveFolderId: folderId,
            icgId,
            name: nameOf.get(icgId)!,
            personId: id.personId,
            contactId: id.contactId,
            groupKey,
          },
          update: { personId: id.personId, contactId: id.contactId, name: nameOf.get(icgId)!, groupKey },
        })
        attributionRows++
      }
    }
    const attributedFolders = plan.perFolder.size

    await tx.attributionGroupDecision.upsert({
      where: { groupKey },
      create: {
        groupKey,
        decision: 'CONFIRMED',
        icgIds,
        folderCount: members.length,
        attributedCount: attributedFolders,
      },
      update: { decision: 'CONFIRMED', icgIds, folderCount: members.length, attributedCount: attributedFolders },
    })

    return {
      groupKey,
      attributedFolders,
      attributionRows,
      dissentingFolders: plan.dissenting.length,
      silentFolders: plan.silent.length,
      contactsCreated,
      personsLinked,
    }
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
  const [groups, decisions, attributed] = await Promise.all([
    getAttributionGroups(),
    prisma.attributionGroupDecision.findMany({
      select: { groupKey: true, decision: true, icgIds: true },
    }),
    prisma.archiveFolderAttribution.groupBy({ by: ['groupKey'], _count: { _all: true } }),
  ])

  const decisionOf = new Map(decisions.map((d) => [d.groupKey, d]))
  const attributedOf = new Map(attributed.map((a) => [a.groupKey ?? '', a._count._all]))

  const enriched: AttributionQueueGroup[] = groups.map((g) => {
    const d = decisionOf.get(g.key)
    return {
      ...g,
      decision: d?.decision ?? null,
      decidedIcgIds: d?.icgIds ?? [],
      attributedFolders: attributedOf.get(g.key) ?? 0,
    }
  })

  const counts = {
    total: enriched.length,
    open: enriched.filter((g) => !g.decision).length,
    unanimous: enriched.filter((g) => !g.decision && g.votedFolders > 0 && g.unanimous).length,
    conflicted: enriched.filter((g) => !g.decision && g.votedFolders > 0 && !g.unanimous).length,
    silent: enriched.filter((g) => !g.decision && g.votedFolders === 0).length,
    decided: enriched.filter((g) => g.decision).length,
    notAPerson: enriched.filter((g) => g.decision === 'NOT_A_PERSON').length,
  }

  const view = opts.view ?? 'open'
  const visible =
    view === 'decided'
      ? enriched.filter((g) => g.decision)
      : view === 'conflicted'
        ? enriched.filter((g) => !g.decision && g.votedFolders > 0 && !g.unanimous)
        : enriched.filter((g) => !g.decision)

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
    },
    orderBy: { folderName: 'asc' },
  })
  return rows
    .filter((r) => {
      const alias = normalizeForSearch(parseFolderParticipantRaw(r.folderName) ?? '')
      return `${(r.parsedShortName ?? '?').toUpperCase()}|${alias}` === groupKey
    })
    .map(({ parsedShortName: _short, coverKey, ...r }) => ({
      ...r,
      coverUrl: coverKey ? buildUrl(coverKey) : null,
    }))
}
