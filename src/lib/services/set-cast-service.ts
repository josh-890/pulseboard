/**
 * Who a set credits, whichever side of promotion it is on.
 *
 * A StagingSet carries its cast as the import delivered it (a JSON list of
 * `{ name, icgId }`); a promoted Set carries it as `SetParticipant`, which is a
 * cache rebuilt from `SessionContribution` and names people through `Person`. Two
 * shapes, one question — and two callers now ask it (the contradiction session and
 * the people files on disk), so it lives in one place.
 */
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import type { FilePerson } from '@/lib/archive-people-file'
import { normalizeForSearch } from '@/lib/normalize'
import type { TxClient } from './cascade-helpers'
import { LEAD_ROLE } from './session-contributors'

export type CastEntry = { title: string; cast: FilePerson[] }

/**
 * Casts for the given staging sets and promoted sets, keyed by id.
 *
 * Ids are unique across both kinds (cuid), so one map serves both without a
 * discriminator at the call site.
 */
export async function loadCasts(stagingSetIds: string[], setIds: string[]): Promise<Map<string, CastEntry>> {
  const stagingIds = [...new Set(stagingSetIds)]
  const promotedIds = [...new Set(setIds)]
  const out = new Map<string, CastEntry>()
  if (stagingIds.length === 0 && promotedIds.length === 0) return out

  const [stagingSets, sets] = await Promise.all([
    stagingIds.length
      ? prisma.stagingSet.findMany({
          where: { id: { in: stagingIds } },
          select: { id: true, title: true, participants: true },
        })
      : Promise.resolve([]),
    promotedIds.length
      ? prisma.set.findMany({
          where: { id: { in: promotedIds } },
          select: {
            id: true,
            title: true,
            participants: {
              select: {
                person: {
                  select: {
                    icgId: true,
                    aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ])

  for (const staging of stagingSets) {
    const raw = Array.isArray(staging.participants)
      ? (staging.participants as { name?: string; icgId?: string }[])
      : []
    out.set(staging.id, {
      title: staging.title,
      cast: raw.map((p) => ({ name: p.name ?? '?', icgId: p.icgId ?? '' })),
    })
  }

  for (const set of sets) {
    out.set(set.id, {
      title: set.title,
      // The common alias is the name a person is listed under; falling back to the
      // ICG-ID keeps the entry identifying even for a person with no alias yet.
      cast: set.participants.map((p) => ({
        name: p.person.aliases[0]?.name ?? p.person.icgId,
        icgId: p.person.icgId,
      })),
    })
  }

  return out
}

type StagedParticipant = { name?: string; icgId?: string; [key: string]: unknown }

/**
 * After promotion the Set's cast is the truth, but the staged sets view still finds
 * a person's sets by the cast recorded on the staging set. When the Set's cast
 * changes (someone replaced, added or removed), the staging sets promoted into it
 * follow: their participants become the Set's on-camera cast. An entry whose
 * person stays keeps what the import recorded for them (name, url).
 *
 * Called from `rebuildSetParticipantsFromContributions`, so every cast change
 * passes through here. A staging set already in step is left untouched, and so
 * is every one while the Set has no on-camera cast.
 */
export async function syncPromotedStagingCasts(tx: TxClient, setId: string): Promise<number> {
  const staged = await tx.stagingSet.findMany({
    where: { promotedSetId: setId, status: 'PROMOTED' },
    select: { id: true, participants: true, participantIcgIds: true, subjectPersonId: true },
  })
  if (staged.length === 0) return 0

  const cast = await tx.setParticipant.findMany({
    where: { setId, roleDefinition: LEAD_ROLE },
    select: {
      person: {
        select: {
          id: true,
          icgId: true,
          aliases: { where: { isCommon: true }, select: { name: true }, take: 1 },
        },
      },
    },
  })
  const people = [...new Map(cast.map((c) => [c.person.id, c.person])).values()]
  // No one on camera (sessions unlinked, a merge half-way): nothing to follow
  if (people.length === 0) return 0
  const castIcgIds = [...new Set(people.map((p) => p.icgId))].sort()

  let changed = 0
  for (const ss of staged) {
    if ([...new Set(ss.participantIcgIds)].sort().join() === castIcgIds.join()) continue

    const before = Array.isArray(ss.participants) ? (ss.participants as StagedParticipant[]) : []
    const participants = people.map((p) => {
      const kept = before.find((b) => b.icgId === p.icgId)
      return { ...kept, name: kept?.name ?? p.aliases[0]?.name ?? p.icgId, icgId: p.icgId }
    })
    const subjectStays = !ss.subjectPersonId || people.some((p) => p.id === ss.subjectPersonId)
    const subject = people.length === 1 ? people[0] : null

    await tx.stagingSet.update({
      where: { id: ss.id },
      data: {
        participants: participants as Prisma.InputJsonValue,
        participantStatuses: participants.map((p, i) => ({
          name: p.name,
          icgId: p.icgId,
          status: 'known',
          personId: people[i].id,
        })),
        participantIcgIds: castIcgIds,
        participantNamesNorm: participants.map((p) => normalizeForSearch(p.name)).join(' '),
        ...(subjectStays ? {} : { subjectPersonId: subject?.id ?? null, subjectIcgId: subject?.icgId ?? null }),
      },
    })
    changed++
  }
  return changed
}
