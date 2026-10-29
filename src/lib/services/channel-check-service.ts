/**
 * Channel check (ADR-0038, channels). Read-only detection behind /channels/check.
 *
 * A channel name in an import file links to a channel only through an import
 * alias the user set, by hand and deliberately. This finds what does not hold
 * to that yet, so each case can be decided on its own:
 *
 * - archive channel folders on disk that no channel names as its Archive folder;
 * - channel names whose staged sets carry a channel only because the names were
 *   alike (the import's old exact-name tier) — no import alias anchors them;
 * - the integrity rule: no set with an archive folder, and no open staged set,
 *   without a channel;
 * - channel names the catalogue writes that no import alias links yet (S4),
 *   with what each would connect.
 */
import { prisma } from "@/lib/db";

const CLOSED_STAGING = ["PROMOTED", "INACTIVE", "SKIPPED"] as const;

export type ChannelHint = {
  id: string;
  name: string;
  shortName: string | null;
  channelFolder: string | null;
  labelName: string | null;
  /** Why it is offered: same Shortname as the folder's prefix, or same name */
  by: "shortName" | "name";
};

export type UnclaimedArchiveFolder = {
  chanFolderName: string;
  folders: number;
  hints: ChannelHint[];
};

export type NameOnlyLink = {
  channelName: string;
  channelId: string;
  appName: string;
  /** Staged sets that took the channel under this name */
  stagedSets: number;
  openStagedSets: number;
};

export type ChannelIntegrity = {
  sets: number;
  setsNoChannel: number;
  archivedNoChannel: { id: string; title: string; folder: string | null }[];
  openStaged: number;
  /** Open staged sets without a channel, per channel name as the import file wrote it */
  stagedNoChannel: { channelName: string; sets: number }[];
};

type ChannelRow = {
  id: string;
  name: string;
  shortName: string | null;
  channelFolder: string | null;
  label: { name: string } | null;
};

const nameKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Archive channel folders are written `Shortname-Channelname` ("SB-ShowyBeauty").
 * Offer the channels whose Shortname is that prefix, or whose name is the rest —
 * hints for the user to pick from, never applied by themselves.
 */
export function channelHintsForFolder(chanFolderName: string, channels: ChannelRow[]): ChannelHint[] {
  const dash = chanFolderName.indexOf("-");
  const prefix = dash > 0 ? chanFolderName.slice(0, dash) : "";
  const rest = nameKey(dash > 0 ? chanFolderName.slice(dash + 1) : chanFolderName);
  const hints: ChannelHint[] = [];
  for (const c of channels) {
    const byShort = Boolean(prefix) && c.shortName?.toUpperCase() === prefix.toUpperCase();
    const byName = Boolean(rest) && nameKey(c.name) === rest;
    if (!byShort && !byName) continue;
    hints.push({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      channelFolder: c.channelFolder,
      labelName: c.label?.name ?? null,
      by: byShort ? "shortName" : "name",
    });
  }
  return hints.sort((a, b) => Number(b.by === "shortName") - Number(a.by === "shortName") || a.name.localeCompare(b.name));
}

export async function getUnclaimedArchiveFolders(): Promise<UnclaimedArchiveFolder[]> {
  const [folders, channels] = await Promise.all([
    prisma.archiveFolder.groupBy({
      by: ["chanFolderName"],
      where: { missingOnDisk: false, chanFolderName: { not: null } },
      _count: { _all: true },
    }),
    prisma.channel.findMany({
      select: { id: true, name: true, shortName: true, channelFolder: true, label: { select: { name: true } } },
    }),
  ]);
  const claimed = new Set(channels.map((c) => c.channelFolder).filter((f): f is string => Boolean(f)));
  return folders
    .filter((f): f is typeof f & { chanFolderName: string } => Boolean(f.chanFolderName) && !claimed.has(f.chanFolderName!))
    .map((f) => ({
      chanFolderName: f.chanFolderName,
      folders: f._count._all,
      hints: channelHintsForFolder(f.chanFolderName, channels),
    }))
    .sort((a, b) => b.folders - a.folders || a.chanFolderName.localeCompare(b.chanFolderName));
}

export async function getNameOnlyLinks(): Promise<NameOnlyLink[]> {
  const rows = await prisma.$queryRaw<
    { channelName: string; channelId: string; appName: string; staged: number; open: number }[]
  >`
    SELECT ss."channelName" AS "channelName", c.id AS "channelId", c.name AS "appName",
           count(*)::int AS staged,
           count(*) FILTER (WHERE ss.status::text NOT IN ('PROMOTED', 'INACTIVE', 'SKIPPED'))::int AS open
    FROM staging_set ss
    JOIN "Channel" c ON c.id = ss."channelId"
    WHERE NOT EXISTS (
      SELECT 1 FROM unnest(c."importAliases") a WHERE upper(trim(a)) = upper(trim(ss."channelName"))
    )
    GROUP BY ss."channelName", c.id, c.name
    ORDER BY staged DESC, ss."channelName"`;
  return rows.map((r) => ({
    channelName: r.channelName,
    channelId: r.channelId,
    appName: r.appName,
    stagedSets: r.staged,
    openStagedSets: r.open,
  }));
}

export async function getChannelIntegrity(): Promise<ChannelIntegrity> {
  const [sets, setsNoChannel, archived, openStaged, stagedNoChannel] = await Promise.all([
    prisma.set.count(),
    prisma.set.count({ where: { channelId: null } }),
    prisma.set.findMany({
      where: { channelId: null, archiveLinks: { some: { status: "CONFIRMED" } } },
      select: {
        id: true,
        title: true,
        archiveLinks: {
          where: { status: "CONFIRMED" },
          select: { archiveFolder: { select: { folderName: true } } },
          take: 1,
        },
      },
      orderBy: { title: "asc" },
    }),
    prisma.stagingSet.count({ where: { status: { notIn: [...CLOSED_STAGING] } } }),
    prisma.stagingSet.groupBy({
      by: ["channelName"],
      where: { status: { notIn: [...CLOSED_STAGING] }, channelId: null },
      _count: { _all: true },
    }),
  ]);
  return {
    sets,
    setsNoChannel,
    archivedNoChannel: archived.map((s) => ({
      id: s.id,
      title: s.title,
      folder: s.archiveLinks[0]?.archiveFolder.folderName ?? null,
    })),
    openStaged,
    stagedNoChannel: stagedNoChannel
      .map((s) => ({ channelName: s.channelName, sets: s._count._all }))
      .sort((a, b) => b.sets - a.sets || a.channelName.localeCompare(b.channelName)),
  };
}

/**
 * "Not this one": the name was never this channel's. Its open staged sets lose
 * the channel and show up as waiting for one — decided again, deliberately.
 */
export async function rejectNameOnlyLink(channelId: string, channelName: string): Promise<{ disconnected: number }> {
  const { count } = await prisma.stagingSet.updateMany({
    where: {
      channelId,
      channelName: { equals: channelName.trim(), mode: "insensitive" },
      status: { notIn: [...CLOSED_STAGING] },
    },
    data: { channelId: null },
  });
  return { disconnected: count };
}

export type CatalogueChannelHint = Omit<ChannelHint, "by"> & {
  /** "archive": archive folders this name matched live in the channel's folder */
  by: "shortName" | "name" | "archive";
};

export type CatalogueChannelName = {
  /** upper(trim(name)) — import aliases match case-insensitively, so one alias links every spelling */
  key: string;
  /** The spelling most rows use — recorded as the import alias */
  channelName: string;
  otherSpellings: string[];
  /** Orphan archive folders the catalogue matched on a set of this channel */
  archiveFolders: number;
  /** The channel folders those archive folders live in */
  archiveChannelFolders: string[];
  /** Open staged sets with this channel name and no channel */
  openStaged: number;
  contacts: number;
  sets: number;
  firstYear: number | null;
  lastYear: number | null;
};

export type CatalogueChannelSort = "waiting" | "az";

/** Waiting on you first (archive folders, staged sets), then by how much the name carries */
export function sortCatalogueChannelNames(rows: CatalogueChannelName[], sort: CatalogueChannelSort): CatalogueChannelName[] {
  const byKey = (a: CatalogueChannelName, b: CatalogueChannelName) => a.key.localeCompare(b.key);
  if (sort === "az") return [...rows].sort(byKey);
  return [...rows].sort(
    (a, b) =>
      b.archiveFolders + b.openStaged - (a.archiveFolders + a.openStaged) ||
      b.contacts - a.contacts ||
      b.sets - a.sets ||
      byKey(a, b),
  );
}

export function filterCatalogueChannelNames(rows: CatalogueChannelName[], q: string): CatalogueChannelName[] {
  const needle = nameKey(q);
  if (!needle) return rows;
  return rows.filter((r) => [r.channelName, ...r.otherSpellings].some((s) => nameKey(s).includes(needle)));
}

/**
 * Channels that may be this catalogue name — hints to pick from, never applied:
 * the channel owning the archive folders it matched, then same name or Shortname.
 */
export function channelHintsForCatalogueName(
  row: Pick<CatalogueChannelName, "channelName" | "otherSpellings" | "archiveChannelFolders">,
  channels: ChannelRow[],
): CatalogueChannelHint[] {
  const keys = new Set([row.channelName, ...row.otherSpellings].map(nameKey).filter(Boolean));
  const folders = new Set(row.archiveChannelFolders);
  const hints: CatalogueChannelHint[] = [];
  for (const c of channels) {
    const by = c.channelFolder && folders.has(c.channelFolder)
      ? "archive"
      : keys.has(nameKey(c.name))
        ? "name"
        : c.shortName && keys.has(nameKey(c.shortName))
          ? "shortName"
          : null;
    if (!by) continue;
    hints.push({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      channelFolder: c.channelFolder,
      labelName: c.label?.name ?? null,
      by,
    });
  }
  const rank = { archive: 0, name: 1, shortName: 2 } as const;
  return hints.sort((a, b) => rank[a.by] - rank[b.by] || a.name.localeCompare(b.name));
}

/**
 * Every channel name the catalogue writes (its sets and its aliases) that no
 * channel holds as an import alias, with what linking it would connect.
 */
export async function getCatalogueChannelNames(): Promise<CatalogueChannelName[]> {
  const rows = await prisma.$queryRaw<
    {
      key: string;
      spellings: string[];
      sets: number;
      firstYear: number | null;
      lastYear: number | null;
      contacts: number;
      archiveFolders: number;
      archiveChannelFolders: string[] | null;
      openStaged: number;
    }[]
  >`
    WITH linked AS (
      SELECT DISTINCT upper(trim(a)) AS k FROM "Channel" c, unnest(c."importAliases") a
    ), cs AS (
      SELECT "channelName" AS s, count(*)::int AS n, min(date) AS first, max(date) AS last
      FROM catalogue_set GROUP BY 1
    ), ca AS (
      SELECT "channelName" AS s, count(*)::int AS n FROM contact_channel_alias GROUP BY 1
    ), spellings AS (
      SELECT upper(trim(s)) AS k, s, sum(n) AS n FROM (SELECT s, n FROM cs UNION ALL SELECT s, n FROM ca) x
      GROUP BY 1, 2
    ), named AS (
      SELECT k, array_agg(s ORDER BY n DESC, s) AS spellings FROM spellings
      WHERE k <> '' AND k NOT IN (SELECT k FROM linked)
      GROUP BY k
    ), sk AS (
      SELECT upper(trim(s)) AS k, sum(n)::int AS sets, min(first) AS first, max(last) AS last FROM cs GROUP BY 1
    ), cc AS (
      SELECT upper(trim("channelName")) AS k, count(DISTINCT "contactId")::int AS contacts
      FROM contact_channel_alias GROUP BY 1
    ), arch AS (
      SELECT upper(trim(s.evidence->>'matchedChannel')) AS k,
             count(DISTINCT s."archiveFolderId")::int AS folders,
             array_agg(DISTINCT f."chanFolderName") FILTER (WHERE f."chanFolderName" IS NOT NULL) AS chans
      FROM archive_folder_suggestion s
      JOIN archive_folder f ON f.id = s."archiveFolderId"
      WHERE s.source = 'CATALOGUE' AND f."missingOnDisk" = false
        AND s.evidence->>'matchedChannel' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ArchiveLink" l WHERE l."archiveFolderId" = f.id AND l.status = 'CONFIRMED'
        )
      GROUP BY 1
    ), st AS (
      SELECT upper(trim("channelName")) AS k, count(*)::int AS n FROM staging_set
      WHERE "channelId" IS NULL AND status::text NOT IN ('PROMOTED', 'INACTIVE', 'SKIPPED')
      GROUP BY 1
    )
    SELECT n.k AS key, n.spellings,
           coalesce(sk.sets, 0) AS sets,
           extract(year FROM sk.first)::int AS "firstYear",
           extract(year FROM sk.last)::int AS "lastYear",
           coalesce(cc.contacts, 0) AS contacts,
           coalesce(arch.folders, 0) AS "archiveFolders",
           arch.chans AS "archiveChannelFolders",
           coalesce(st.n, 0) AS "openStaged"
    FROM named n
    LEFT JOIN sk ON sk.k = n.k
    LEFT JOIN cc ON cc.k = n.k
    LEFT JOIN arch ON arch.k = n.k
    LEFT JOIN st ON st.k = n.k`;
  return rows.map((r) => ({
    key: r.key,
    channelName: r.spellings[0],
    otherSpellings: r.spellings.slice(1),
    archiveFolders: r.archiveFolders,
    archiveChannelFolders: (r.archiveChannelFolders ?? []).sort(),
    openStaged: r.openStaged,
    contacts: r.contacts,
    sets: r.sets,
    firstYear: r.firstYear,
    lastYear: r.lastYear,
  }));
}

/** One number for the /channels header: everything the check still lists */
export async function countChannelCheckItems(): Promise<number> {
  const [folders, links, integrity] = await Promise.all([
    getUnclaimedArchiveFolders(),
    getNameOnlyLinks(),
    getChannelIntegrity(),
  ]);
  return folders.length + links.length + integrity.archivedNoChannel.length + integrity.stagedNoChannel.length;
}
