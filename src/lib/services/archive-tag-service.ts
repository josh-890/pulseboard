import { prisma } from "@/lib/db";
import {
  canonicalTagMarker,
  reconcileTagSet,
  resolveTagMarkers,
} from "@/lib/archive-tags";
import type { CatalogTag } from "@/lib/tag-query";
import { addTagsToEntity, removeTagsFromEntity } from "./entity-tag-service";
import { loadTagCatalog } from "./tag-filter-service";
import { getDirectTagsBatch } from "./tag-effective-service";
import type { EffectiveTag } from "@/lib/effective-tags";
import { createTagAlias, createTagDefinition } from "./tag-service";

// Archive folder tags (ADR-0034). Before promotion a folder's tags are its own
// (`ArchiveFolderTag`); once a CONFIRMED link joins it to a Set they live on the
// Set (`SetTag`) and the disk follows the Set. The disk side is one empty file per
// tag in `.pulseboard\` (`#name`), reconciled per tag with the ADR-0032 rule.
//
// Ownership heals itself rather than being wired into every link path: wherever a
// folder is read for tags, rows still on a set-linked folder move to the Set, and
// an owner change (unlink, set deleted) makes the next reconciliation unite
// instead of deleting markers (`tagsSyncedOwner`).

export type FolderTagOwner = { type: "ARCHIVE_FOLDER"; id: string; key: "folder" } | { type: "SET"; id: string; key: string };

type FolderRow = {
  id: string;
  archiveLink: { status: string; setId: string | null } | null;
};

export function folderTagOwner(folder: FolderRow): FolderTagOwner {
  const setId = folder.archiveLink?.status === "CONFIRMED" ? folder.archiveLink.setId : null;
  return setId ? { type: "SET", id: setId, key: setId } : { type: "ARCHIVE_FOLDER", id: folder.id, key: "folder" };
}

/**
 * Move tags still sitting on set-linked folders to their Set (promotion, a
 * confirmed folder→set link, or any path that linked without moving them).
 * Domain and exclusive-group rules apply as for any tag write.
 */
export async function absorbFolderTagsIntoSets(folderIds?: string[]): Promise<number> {
  const rows = await prisma.archiveFolderTag.findMany({
    where: {
      ...(folderIds ? { archiveFolderId: { in: folderIds } } : {}),
      archiveFolder: { archiveLink: { status: "CONFIRMED", setId: { not: null } } },
    },
    select: { archiveFolderId: true, tagDefinitionId: true, archiveFolder: { select: { archiveLink: { select: { setId: true } } } } },
  });
  const bySet = new Map<string, { folderIds: Set<string>; tagIds: Set<string> }>();
  for (const r of rows) {
    const setId = r.archiveFolder.archiveLink?.setId;
    if (!setId) continue;
    const e = bySet.get(setId) ?? { folderIds: new Set(), tagIds: new Set() };
    e.folderIds.add(r.archiveFolderId);
    e.tagIds.add(r.tagDefinitionId);
    bySet.set(setId, e);
  }
  for (const [setId, e] of bySet) {
    await addTagsToEntity("SET", setId, [...e.tagIds], "IMPORT");
    await prisma.archiveFolderTag.deleteMany({ where: { archiveFolderId: { in: [...e.folderIds] } } });
    // The disk state was reconciled against these folder tags, which are now the Set's
    await prisma.archiveFolder.updateMany({ where: { id: { in: [...e.folderIds] } }, data: { tagsSyncedOwner: setId } });
  }
  return rows.length;
}

/** Current tag ids of each owner, batched */
async function ownerTagIds(owners: FolderTagOwner[]): Promise<Map<string, string[]>> {
  const folderIds = owners.filter((o) => o.type === "ARCHIVE_FOLDER").map((o) => o.id);
  const setIds = owners.filter((o) => o.type === "SET").map((o) => o.id);
  const [folderRows, setRows] = await Promise.all([
    folderIds.length
      ? prisma.archiveFolderTag.findMany({ where: { archiveFolderId: { in: folderIds } }, select: { archiveFolderId: true, tagDefinitionId: true } })
      : Promise.resolve([]),
    setIds.length
      ? prisma.setTag.findMany({ where: { setId: { in: setIds } }, select: { setId: true, tagDefinitionId: true } })
      : Promise.resolve([]),
  ]);
  const map = new Map<string, string[]>();
  for (const r of folderRows) map.set(`ARCHIVE_FOLDER:${r.archiveFolderId}`, [...(map.get(`ARCHIVE_FOLDER:${r.archiveFolderId}`) ?? []), r.tagDefinitionId]);
  for (const r of setRows) map.set(`SET:${r.setId}`, [...(map.get(`SET:${r.setId}`) ?? []), r.tagDefinitionId]);
  return map;
}

const ownerKey = (o: FolderTagOwner) => `${o.type}:${o.id}`;

// ─── Scan → app ──────────────────────────────────────────────────────────────

export type TagScanItem = { fullPath: string; tagMarkers?: string[] | string | null };

/**
 * PowerShell's ConvertTo-Json turns a one-element array into a bare string; take
 * either. Anything else (null, absent) means "not looked".
 */
function markersOf(item: TagScanItem): string[] | null {
  if (Array.isArray(item.tagMarkers)) return item.tagMarkers.filter((m): m is string => typeof m === "string");
  if (typeof item.tagMarkers === "string") return [item.tagMarkers];
  return null;
}

export type TagScanCounts = { adopted: number; removed: number; unknown: number; conflicts: number; toWrite: number };

/**
 * Reconcile the `#…` markers a Full scan reported. Only items carrying a
 * `tagMarkers` array count — "not looked" (targeted runs, older agents) never
 * reads as "all markers deleted".
 */
export async function reconcileFolderTagsFromScan(items: TagScanItem[]): Promise<TagScanCounts> {
  const counts: TagScanCounts = { adopted: 0, removed: 0, unknown: 0, conflicts: 0, toWrite: 0 };
  const reported = items
    .map((i) => ({ fullPath: i.fullPath, tagMarkers: markersOf(i) }))
    .filter((i): i is { fullPath: string; tagMarkers: string[] } => i.tagMarkers !== null);
  if (reported.length === 0) return counts;

  const folders = await prisma.archiveFolder.findMany({
    where: { fullPath: { in: reported.map((i) => i.fullPath) } },
    select: {
      id: true,
      fullPath: true,
      tagsDiskSeen: true,
      tagsDiskState: true,
      tagsSyncedOwner: true,
      tagMarkersUnknown: true,
      tagMarkersConflicts: true,
      archiveLink: { select: { status: true, setId: true } },
    },
  });
  await absorbFolderTagsIntoSets(folders.filter((f) => folderTagOwner(f).type === "SET").map((f) => f.id));

  const markersByPath = new Map(reported.map((i) => [i.fullPath, i.tagMarkers]));
  const owners = folders.map((f) => folderTagOwner(f));
  const appTags = await ownerTagIds(owners);

  let catalog: CatalogTag[] | null = null;
  const quietIds: string[] = [];

  for (let i = 0; i < folders.length; i++) {
    const f = folders[i];
    const owner = owners[i];
    const markers = markersByPath.get(f.fullPath) ?? [];
    const appNow = appTags.get(ownerKey(owner)) ?? [];
    const sameOwner = f.tagsSyncedOwner === null || f.tagsSyncedOwner === owner.key;

    // Nothing anywhere: just note that the disk has now been looked at
    if (
      markers.length === 0 && appNow.length === 0 && (f.tagsDiskState ?? []).length === 0 &&
      (f.tagMarkersUnknown ?? []).length === 0 && (f.tagMarkersConflicts ?? []).length === 0
    ) {
      if (!f.tagsDiskSeen || f.tagsSyncedOwner !== owner.key) quietIds.push(f.id);
      continue;
    }

    catalog ??= await loadTagCatalog();
    const disk = resolveTagMarkers(markers, catalog);
    const groupOf = new Map(catalog.map((t) => [t.id, t.groupId]));
    const outsideConflict = (id: string) => !disk.conflictGroupIds.includes(groupOf.get(id) ?? "");
    const prior = f.tagsDiskState ?? [];

    const r = reconcileTagSet({
      diskNow: disk.ids,
      lastSeen: f.tagsDiskSeen && sameOwner ? prior.filter(outsideConflict) : null,
      appNow: appNow.filter(outsideConflict),
      holdDiskRemovals: disk.unknown.length > 0,
    });

    if (r.appAdd.length) await addTagsToEntity(owner.type, owner.id, r.appAdd, "IMPORT");
    if (r.appRemove.length) await removeTagsFromEntity(owner.type, owner.id, r.appRemove);

    // Conflicting groups keep their previous remembered state until resolved
    const lastSeenNext = [...r.lastSeenNext, ...prior.filter((id) => !outsideConflict(id))];
    await prisma.archiveFolder.update({
      where: { id: f.id },
      data: {
        tagsDiskSeen: true,
        tagsDiskState: [...new Set(lastSeenNext)],
        tagsSyncedOwner: owner.key,
        tagMarkersUnknown: disk.unknown,
        tagMarkersConflicts: disk.conflicts,
      },
    });

    counts.adopted += r.appAdd.length;
    counts.removed += r.appRemove.length;
    counts.unknown += disk.unknown.length;
    counts.conflicts += disk.conflicts.length;
    const diskSet = new Set(disk.ids);
    if (r.diskWanted.length !== diskSet.size || r.diskWanted.some((id) => !diskSet.has(id))) counts.toWrite++;
  }

  if (quietIds.length) {
    // Owner per folder differs, so record them one owner key at a time
    const byKey = new Map<string, string[]>();
    for (const id of quietIds) {
      const idx = folders.findIndex((f) => f.id === id);
      const key = owners[idx].key;
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    }
    for (const [key, ids] of byKey) {
      await prisma.archiveFolder.updateMany({ where: { id: { in: ids } }, data: { tagsDiskSeen: true, tagsSyncedOwner: key } });
    }
  }
  return counts;
}

// ─── App → disk ──────────────────────────────────────────────────────────────

export type TagWrite = {
  fullPath: string;
  /** The complete set of `#…` marker base names the folder's `.pulseboard\` should hold */
  want: string[];
};

/**
 * Folders whose tags changed in the app since the disk was last read. Only folders
 * the scan has already reported (`tagsDiskSeen`) — before that the disk may hold
 * markers the app has not seen, and a write would delete them. Unknown and
 * conflicting markers are wanted unchanged, so the agent never removes them.
 */
export async function getTagWrites(): Promise<TagWrite[]> {
  await absorbFolderTagsIntoSets();
  const candidates = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT f.id FROM archive_folder f
    LEFT JOIN "ArchiveLink" l ON l."archiveFolderId" = f.id AND l.status = 'CONFIRMED'
    WHERE f."missingOnDisk" = false AND f."tagsDiskSeen" = true AND (
      cardinality(f."tagsDiskState") > 0
      OR EXISTS (SELECT 1 FROM archive_folder_tag t WHERE t."archiveFolderId" = f.id)
      OR (l."setId" IS NOT NULL AND EXISTS (SELECT 1 FROM set_tag t WHERE t."setId" = l."setId"))
    )`;
  if (candidates.length === 0) return [];

  const folders = await prisma.archiveFolder.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    select: {
      id: true,
      fullPath: true,
      tagsDiskState: true,
      tagsSyncedOwner: true,
      tagMarkersUnknown: true,
      tagMarkersConflicts: true,
      archiveLink: { select: { status: true, setId: true } },
    },
    orderBy: { fullPath: "asc" },
  });
  const owners = folders.map((f) => folderTagOwner(f));
  const appTags = await ownerTagIds(owners);
  const catalog = await loadTagCatalog();
  const byId = new Map(catalog.map((t) => [t.id, t]));

  const writes: TagWrite[] = [];
  folders.forEach((f, i) => {
    const owner = owners[i];
    // The owner changed since the last read: the next scan unites first
    if (f.tagsSyncedOwner !== null && f.tagsSyncedOwner !== owner.key) return;
    const conflictGroups = resolveTagMarkers(f.tagMarkersConflicts ?? [], catalog).conflictGroupIds;
    const free = (id: string) => !conflictGroups.includes(byId.get(id)?.groupId ?? "");
    const want = (appTags.get(ownerKey(owner)) ?? []).filter(free);
    const seen = (f.tagsDiskState ?? []).filter(free);
    const same = want.length === seen.length && want.every((id) => seen.includes(id));
    if (same) return;
    writes.push({
      fullPath: f.fullPath,
      want: [
        ...want.map((id) => byId.get(id)).filter((t): t is CatalogTag => !!t).map((t) => canonicalTagMarker(t, catalog)),
        ...(f.tagMarkersUnknown ?? []),
        ...(f.tagMarkersConflicts ?? []),
      ],
    });
  });
  return writes;
}

// ─── Unknown marker names ────────────────────────────────────────────────────

export type ResolveDiskTagTarget = { createInGroupId: string } | { aliasOfTagId: string };

/**
 * Teach the catalogue an unknown marker name — as a new tag in a group, or as an
 * alias of an existing tag — and adopt it on every folder that carries it.
 */
/** A tag picked (or just created) under the marker's own name needs no alias */
async function aliasUnlessSameName(tagId: string, name: string): Promise<string> {
  const tag = await prisma.tagDefinition.findUniqueOrThrow({ where: { id: tagId }, select: { name: true, slug: true } });
  const n = name.toLowerCase();
  if (tag.name.toLowerCase() !== n && tag.slug !== n) await createTagAlias(tagId, name);
  return tagId;
}

export async function resolveDiskTagName(markerRaw: string, target: ResolveDiskTagTarget): Promise<number> {
  const name = markerRaw.replace(/^#/, "").replace(/^[^=]*=/, "").replace(/_/g, " ").trim();
  if (!name) throw new Error("Empty marker name");
  const tagId =
    "createInGroupId" in target
      ? (await createTagDefinition({ groupId: target.createInGroupId, name })).id
      : await aliasUnlessSameName(target.aliasOfTagId, name);

  const folders = await prisma.archiveFolder.findMany({
    where: { tagMarkersUnknown: { has: markerRaw } },
    select: { id: true, tagsDiskState: true, tagMarkersUnknown: true, archiveLink: { select: { status: true, setId: true } } },
  });
  for (const f of folders) {
    const owner = folderTagOwner(f);
    await addTagsToEntity(owner.type, owner.id, [tagId], "IMPORT");
    await prisma.archiveFolder.update({
      where: { id: f.id },
      data: {
        tagMarkersUnknown: (f.tagMarkersUnknown ?? []).filter((m) => m !== markerRaw),
        // The marker is on disk: remembered as seen, so no write and no re-adoption
        tagsDiskState: [...new Set([...(f.tagsDiskState ?? []), tagId])],
      },
    });
  }
  return folders.length;
}

// ─── Read for the UI ─────────────────────────────────────────────────────────

export type FolderTagInfo = {
  owner: FolderTagOwner;
  unknown: string[];
  conflicts: string[];
};

export async function getFolderTagInfo(folderId: string): Promise<FolderTagInfo | null> {
  await absorbFolderTagsIntoSets([folderId]);
  const f = await prisma.archiveFolder.findUnique({
    where: { id: folderId },
    select: { id: true, tagMarkersUnknown: true, tagMarkersConflicts: true, archiveLink: { select: { status: true, setId: true } } },
  });
  if (!f) return null;
  return { owner: folderTagOwner(f), unknown: f.tagMarkersUnknown ?? [], conflicts: f.tagMarkersConflicts ?? [] };
}

/** What a list row needs to show and edit a folder's tags */
export type FolderTagsView = {
  /** Which entity the row edits: the folder, or the Set it is confirmed to */
  owner: { type: "ARCHIVE_FOLDER" | "SET"; id: string };
  tags: EffectiveTag[];
  unknown: string[];
  conflicts: string[];
};

export async function getFolderTagViews(folderIds: string[]): Promise<Map<string, FolderTagsView>> {
  const out = new Map<string, FolderTagsView>();
  if (folderIds.length === 0) return out;
  await absorbFolderTagsIntoSets(folderIds);
  const folders = await prisma.archiveFolder.findMany({
    where: { id: { in: folderIds } },
    select: { id: true, tagMarkersUnknown: true, tagMarkersConflicts: true, archiveLink: { select: { status: true, setId: true } } },
  });
  const owners = folders.map((f) => ({ folder: f, owner: folderTagOwner(f) }));
  const [folderTags, setTags] = await Promise.all([
    getDirectTagsBatch("ARCHIVE_FOLDER", owners.filter((o) => o.owner.type === "ARCHIVE_FOLDER").map((o) => o.owner.id)),
    getDirectTagsBatch("SET", owners.filter((o) => o.owner.type === "SET").map((o) => o.owner.id)),
  ]);
  for (const { folder, owner } of owners) {
    out.set(folder.id, {
      owner: { type: owner.type, id: owner.id },
      tags: (owner.type === "SET" ? setTags : folderTags).get(owner.id) ?? [],
      unknown: folder.tagMarkersUnknown ?? [],
      conflicts: folder.tagMarkersConflicts ?? [],
    });
  }
  return out;
}
