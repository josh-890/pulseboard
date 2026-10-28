/**
 * The app's side of the catalogue inventory (ADR-0038). Read-only.
 *
 * The inventory agent judges the catalogue on its own machine; to tell what the
 * catalogue would add it needs to know what the app already holds: which ICG-IDs
 * are Persons and Contacts, which portraits the avatar agent has sent (and which
 * the app refused), which open staged sets have a cast member who is not a
 * developed Person, and how big the data is today.
 */
import { prisma } from '@/lib/db'
import type { InventoryContext } from '@/lib/services/catalogue-inventory'

const CLOSED_STAGING = ['PROMOTED', 'INACTIVE', 'SKIPPED'] as const

export async function getCatalogueInventoryContext(): Promise<InventoryContext> {
  const [persons, contacts, avatars, stagedRows, sizeRows] = await Promise.all([
    prisma.person.findMany({ select: { icgId: true } }),
    prisma.contact.findMany({
      where: { icgId: { not: null } },
      select: { icgId: true, ignoredAt: true, thumbUrl: true },
    }),
    prisma.catalogueAvatar.findMany({ select: { icgId: true, key: true, error: true } }),
    prisma.stagingSet.findMany({
      where: { status: { notIn: [...CLOSED_STAGING] } },
      select: { id: true, title: true, participantIcgIds: true },
    }),
    prisma.$queryRaw<{ database: bigint; contact: bigint; contacts: bigint; avatars: bigint }[]>`
      SELECT pg_database_size(current_database()) AS database,
             pg_total_relation_size('"PersonRef"') AS contact,
             (SELECT count(*) FROM "PersonRef") AS contacts,
             (SELECT count(*) FROM catalogue_avatar) AS avatars`,
  ])

  // A thin Contact is not recognisable (ADR-0038 §1): only a Person counts as known here
  const developed = new Set<string>(persons.map((p) => p.icgId))
  let noCast = 0
  const waiting = stagedRows.flatMap((s) => {
    const cast = [...new Set(s.participantIcgIds)].filter(Boolean)
    if (cast.length === 0) noCast++
    const nonPersons = cast.filter((id) => !developed.has(id))
    return nonPersons.length ? [{ id: s.id, title: s.title, nonPersons }] : []
  })
  const size = sizeRows[0]

  return {
    persons: persons.map((p) => p.icgId),
    contacts: contacts.map((c) => ({ icgId: c.icgId!, ignored: c.ignoredAt !== null, hasThumb: Boolean(c.thumbUrl) })),
    avatars: avatars.map((a) => ({ icgId: a.icgId, ok: a.key !== null, error: a.error })),
    staged: { open: stagedRows.length, noCast, waiting },
    size: {
      databaseBytes: Number(size?.database ?? 0),
      contactBytes: Number(size?.contact ?? 0),
      contactRows: Number(size?.contacts ?? 0),
      avatarRows: Number(size?.avatars ?? 0),
    },
  }
}
