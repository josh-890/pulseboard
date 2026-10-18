/**
 * Cast readiness — is everyone in a staged set already a Person in the app?
 *
 * A participant counts as developed when it resolves to an existing Person:
 * through the personId on its participantStatuses entry, or through its ICG-ID.
 * That is exactly how promotion resolves the cast; anyone else would only be
 * credited as a Contact and get no career from the set. The Career tab's
 * promote is locked until the cast is complete (2026-10-18).
 */

import { prisma } from '@/lib/db'

export type UndevelopedParticipant = { name: string; icgId: string }

type RawParticipant = { name: string; icgId?: string | null }
type RawStatus = { name: string; icgId?: string | null; personId?: string | null }

/**
 * Pure core: the participants of one staged set that do not resolve to a
 * Person, given which personIds and ICG-IDs exist.
 */
export function findUndevelopedParticipants(
  participants: RawParticipant[],
  statuses: RawStatus[],
  existingPersonIds: ReadonlySet<string>,
  existingIcgIds: ReadonlySet<string>,
): UndevelopedParticipant[] {
  return participants
    .filter((p) => {
      const icg = p.icgId ?? ''
      if (icg && existingIcgIds.has(icg)) return false
      const status = statuses.find((s) => s.name === p.name && (s.icgId ?? '') === icg)
      return !(status?.personId && existingPersonIds.has(status.personId))
    })
    .map((p) => ({ name: p.name, icgId: p.icgId ?? '' }))
}

/** Batched: undeveloped participants per staging set id (sets with a complete cast map to []). */
export async function getUndevelopedParticipants(
  sets: Array<{ id: string; participants: unknown; participantStatuses: unknown }>,
): Promise<Map<string, UndevelopedParticipant[]>> {
  const parsed = sets.map((s) => ({
    id: s.id,
    participants: (Array.isArray(s.participants) ? s.participants : []) as RawParticipant[],
    statuses: (Array.isArray(s.participantStatuses) ? s.participantStatuses : []) as RawStatus[],
  }))

  const icgIds = new Set<string>()
  const personIds = new Set<string>()
  for (const s of parsed) {
    for (const p of s.participants) if (p.icgId) icgIds.add(p.icgId)
    for (const st of s.statuses) if (st.personId) personIds.add(st.personId)
  }

  const persons =
    icgIds.size > 0 || personIds.size > 0
      ? await prisma.person.findMany({
          where: {
            OR: [
              ...(icgIds.size > 0 ? [{ icgId: { in: Array.from(icgIds) } }] : []),
              ...(personIds.size > 0 ? [{ id: { in: Array.from(personIds) } }] : []),
            ],
          },
          select: { id: true, icgId: true },
        })
      : []
  const existingPersonIds = new Set(persons.map((p) => p.id))
  const existingIcgIds = new Set(persons.map((p) => p.icgId).filter((i): i is string => !!i))

  return new Map(
    parsed.map((s) => [
      s.id,
      findUndevelopedParticipants(s.participants, s.statuses, existingPersonIds, existingIcgIds),
    ]),
  )
}

/** Single-set convenience for the promote preview and the promote guard. */
export async function getUndevelopedParticipantsForStagingSet(
  stagingSetId: string,
): Promise<UndevelopedParticipant[]> {
  const ss = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    select: { id: true, participants: true, participantStatuses: true },
  })
  if (!ss) return []
  return (await getUndevelopedParticipants([ss])).get(ss.id) ?? []
}
