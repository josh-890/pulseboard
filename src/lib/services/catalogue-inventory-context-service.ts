/**
 * The app's side of the catalogue inventory (ADR-0038). Read-only.
 *
 * The inventory agent judges the catalogue on its own machine; to tell what the
 * catalogue would add it needs to know what the app already holds: which ICG-IDs
 * are Persons and Contacts, which portraits the avatar agent has sent (and which
 * the app refused), which open staged sets have a cast member who is not a
 * developed Person, how big the data is today, and the channels: what the app
 * holds, which sets and staged sets lack one, which archive channel folders no
 * channel claims.
 */
import { prisma } from '@/lib/db'
import type { ChannelContext, InventoryContext } from '@/lib/services/catalogue-inventory'

const CLOSED_STAGING = ['PROMOTED', 'INACTIVE', 'SKIPPED'] as const

export async function getCatalogueInventoryContext(): Promise<InventoryContext> {
  const [persons, contacts, avatars, stagedRows, sizeRows, channels] = await Promise.all([
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
    getChannelContext(),
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
    channels,
  }
}

async function getChannelContext(): Promise<ChannelContext> {
  const [channels, setsTotal, setsNoChannel, archivedNoChannel, stagedAll, stagedNoChannel, folders] = await Promise.all([
    prisma.channel.findMany({
      select: { id: true, name: true, shortName: true, channelFolder: true, labelId: true, importAliases: true },
    }),
    prisma.set.count(),
    prisma.set.count({ where: { channelId: null } }),
    prisma.set.findMany({
      where: { channelId: null, archiveLinks: { some: { status: 'CONFIRMED' } } },
      select: {
        id: true,
        title: true,
        archiveLinks: { where: { status: 'CONFIRMED' }, select: { archiveFolder: { select: { folderName: true } } }, take: 1 },
      },
    }),
    prisma.stagingSet.groupBy({
      by: ['channelName'],
      where: { status: { notIn: [...CLOSED_STAGING] } },
      _count: { _all: true },
    }),
    prisma.stagingSet.groupBy({
      by: ['channelName'],
      where: { status: { notIn: [...CLOSED_STAGING] }, channelId: null },
      _count: { _all: true },
    }),
    prisma.archiveFolder.groupBy({
      by: ['chanFolderName'],
      where: { missingOnDisk: false },
      _count: { _all: true },
    }),
  ])
  const noChannelOf = new Map(stagedNoChannel.map((s) => [s.channelName, s._count._all]))
  return {
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      channelFolder: c.channelFolder,
      hasLabel: c.labelId !== null,
      importAliases: c.importAliases,
    })),
    sets: { total: setsTotal, noChannel: setsNoChannel },
    archivedNoChannel: archivedNoChannel.map((s) => ({
      id: s.id,
      title: s.title,
      folder: s.archiveLinks[0]?.archiveFolder.folderName ?? null,
    })),
    staged: stagedAll.map((s) => ({ channelName: s.channelName, open: s._count._all, noChannel: noChannelOf.get(s.channelName) ?? 0 })),
    archiveFolders: folders.map((f) => ({ chanFolderName: f.chanFolderName, folders: f._count._all })),
  }
}
