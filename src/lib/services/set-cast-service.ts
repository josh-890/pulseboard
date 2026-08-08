/**
 * Who a set credits, whichever side of promotion it is on.
 *
 * A StagingSet carries its cast as the import delivered it (a JSON list of
 * `{ name, icgId }`); a promoted Set carries it as `SetParticipant`, which is a
 * cache rebuilt from `SessionContribution` and names people through `Person`. Two
 * shapes, one question — and two callers now ask it (the contradiction session and
 * the people files on disk), so it lives in one place.
 */
import { prisma } from '@/lib/db'
import type { FilePerson } from '@/lib/archive-people-file'

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
