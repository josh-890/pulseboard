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
 *   without a channel.
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

/** One number for the /channels header: everything the check still lists */
export async function countChannelCheckItems(): Promise<number> {
  const [folders, links, integrity] = await Promise.all([
    getUnclaimedArchiveFolders(),
    getNameOnlyLinks(),
    getChannelIntegrity(),
  ]);
  return folders.length + links.length + integrity.archivedNoChannel.length + integrity.stagedNoChannel.length;
}
