import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { TagSource } from "@/generated/prisma/client";
import { domainsForEntity, type TaggableEntity } from "@/lib/tag-domains";

export { domainsForEntity };
export type { TaggableEntity };
import type { TagDefinitionWithGroup } from "./tag-service";


type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const GROUP_SELECT = {
  id: true,
  name: true,
  slug: true,
  color: true,
  isExclusive: true,
  domain: true,
  typicalLevel: true,
  kind: true,
} as const;


/**
 * Validate and normalise the tags about to be written to one entity type.
 * Rejects a tag whose group domain does not admit the entity (the hard rule),
 * and collapses several tags of one exclusive group to the last one given —
 * the picker's "a new pick replaces the old" semantics, applied server-side so
 * no caller can store two.
 */
async function prepareTagIds(
  tx: TxClient,
  entityType: TaggableEntity,
  tagDefinitionIds: string[],
): Promise<string[]> {
  const unique = [...new Set(tagDefinitionIds)];
  if (unique.length === 0) return [];
  const defs = await tx.tagDefinition.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, group: { select: { id: true, isExclusive: true, domain: true } } },
  });
  const byId = new Map(defs.map((d) => [d.id, d]));
  const allowed = domainsForEntity(entityType);
  const exclusivePick = new Map<string, string>();
  const result: string[] = [];
  for (const id of unique) {
    const def = byId.get(id);
    if (!def) throw new Error(`Unknown tag ${id}`);
    if (!allowed.includes(def.group.domain)) {
      throw new Error(`Tag "${def.name}" (${def.group.domain}) cannot be applied to ${entityType}`);
    }
    if (def.group.isExclusive) exclusivePick.set(def.group.id, id);
    else result.push(id);
  }
  return [...result, ...exclusivePick.values()];
}

// ─── Exclusive Group Enforcement ─────────────────────────────────────────────

async function enforceExclusiveGroups(
  tx: TxClient,
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
) {
  if (tagDefinitionIds.length === 0) return;

  // Fetch the groups for the tags being added
  const tagsToAdd = await tx.tagDefinition.findMany({
    where: { id: { in: tagDefinitionIds } },
    include: { group: { select: { id: true, isExclusive: true } } },
  });

  // Collect exclusive group IDs
  const exclusiveGroupIds = new Set(
    tagsToAdd.filter((t) => t.group.isExclusive).map((t) => t.group.id),
  );

  if (exclusiveGroupIds.size === 0) return;

  // For each exclusive group, find existing tags on this entity from that group and remove them
  for (const groupId of exclusiveGroupIds) {
    // Find existing tag IDs from this group on this entity
    const existingTagsInGroup = await tx.tagDefinition.findMany({
      where: { groupId },
      select: { id: true },
    });
    const existingTagIds = existingTagsInGroup.map((t) => t.id);
    // Exclude the ones we're about to add
    const newTagIdsForGroup = tagsToAdd
      .filter((t) => t.group.id === groupId)
      .map((t) => t.id);
    const toRemove = existingTagIds.filter((id) => !newTagIdsForGroup.includes(id));

    if (toRemove.length === 0) continue;

    const where = { tagDefinitionId: { in: toRemove } };
    switch (entityType) {
      case "PERSON":
        await tx.personTag.deleteMany({ where: { personId: entityId, ...where } });
        break;
      case "SESSION":
        await tx.sessionTag.deleteMany({ where: { sessionId: entityId, ...where } });
        break;
      case "MEDIA_ITEM":
        await tx.mediaItemTag.deleteMany({ where: { mediaItemId: entityId, ...where } });
        break;
      case "SET":
        await tx.setTag.deleteMany({ where: { setId: entityId, ...where } });
        break;
      case "PROJECT":
        await tx.projectTag.deleteMany({ where: { projectId: entityId, ...where } });
        break;
      case "ARCHIVE_FOLDER":
        await tx.archiveFolderTag.deleteMany({ where: { archiveFolderId: entityId, ...where } });
        break;
    }
  }
}

// ─── Core Operations ────────────────────────────────────────────────────────

export async function addTagsToEntity(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
  source: TagSource = "MANUAL",
) {
  if (tagDefinitionIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    tagDefinitionIds = await prepareTagIds(tx, entityType, tagDefinitionIds);
    await enforceExclusiveGroups(tx, entityType, entityId, tagDefinitionIds);
    switch (entityType) {
      case "PERSON":
        await tx.personTag.createMany({
          data: tagDefinitionIds.map((tagDefinitionId) => ({
            personId: entityId,
            tagDefinitionId,
            source,
          })),
          skipDuplicates: true,
        });
        break;
      case "SESSION":
        await tx.sessionTag.createMany({
          data: tagDefinitionIds.map((tagDefinitionId) => ({
            sessionId: entityId,
            tagDefinitionId,
            source,
          })),
          skipDuplicates: true,
        });
        break;
      case "MEDIA_ITEM":
        await tx.mediaItemTag.createMany({
          data: tagDefinitionIds.map((tagDefinitionId) => ({
            mediaItemId: entityId,
            tagDefinitionId,
            source,
          })),
          skipDuplicates: true,
        });
        break;
      case "SET":
        await tx.setTag.createMany({
          data: tagDefinitionIds.map((tagDefinitionId) => ({
            setId: entityId,
            tagDefinitionId,
            source,
          })),
          skipDuplicates: true,
        });
        break;
      case "PROJECT":
        await tx.projectTag.createMany({
          data: tagDefinitionIds.map((tagDefinitionId) => ({
            projectId: entityId,
            tagDefinitionId,
            source,
          })),
          skipDuplicates: true,
        });
        break;
      case "ARCHIVE_FOLDER":
        await tx.archiveFolderTag.createMany({
          data: tagDefinitionIds.map((tagDefinitionId) => ({
            archiveFolderId: entityId,
            tagDefinitionId,
            source,
          })),
          skipDuplicates: true,
        });
        break;
    }
  });
}

export async function removeTagsFromEntity(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
) {
  if (tagDefinitionIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    const where = { tagDefinitionId: { in: tagDefinitionIds } };
    switch (entityType) {
      case "PERSON":
        await tx.personTag.deleteMany({ where: { personId: entityId, ...where } });
        break;
      case "SESSION":
        await tx.sessionTag.deleteMany({ where: { sessionId: entityId, ...where } });
        break;
      case "MEDIA_ITEM":
        await tx.mediaItemTag.deleteMany({ where: { mediaItemId: entityId, ...where } });
        break;
      case "SET":
        await tx.setTag.deleteMany({ where: { setId: entityId, ...where } });
        break;
      case "PROJECT":
        await tx.projectTag.deleteMany({ where: { projectId: entityId, ...where } });
        break;
      case "ARCHIVE_FOLDER":
        await tx.archiveFolderTag.deleteMany({ where: { archiveFolderId: entityId, ...where } });
        break;
    }
  });
}

export async function setEntityTags(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
  source: TagSource = "MANUAL",
) {
  await prisma.$transaction(async (tx) => {
    tagDefinitionIds = await prepareTagIds(tx, entityType, tagDefinitionIds);
    // Delete all existing tags for this entity
    switch (entityType) {
      case "PERSON":
        await tx.personTag.deleteMany({ where: { personId: entityId } });
        break;
      case "SESSION":
        await tx.sessionTag.deleteMany({ where: { sessionId: entityId } });
        break;
      case "MEDIA_ITEM":
        await tx.mediaItemTag.deleteMany({ where: { mediaItemId: entityId } });
        break;
      case "SET":
        await tx.setTag.deleteMany({ where: { setId: entityId } });
        break;
      case "PROJECT":
        await tx.projectTag.deleteMany({ where: { projectId: entityId } });
        break;
      case "ARCHIVE_FOLDER":
        await tx.archiveFolderTag.deleteMany({ where: { archiveFolderId: entityId } });
        break;
    }

    if (tagDefinitionIds.length > 0) {
      // Enforce exclusive groups on the new set
      await enforceExclusiveGroups(tx, entityType, entityId, tagDefinitionIds);

      switch (entityType) {
        case "PERSON":
          await tx.personTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              personId: entityId,
              tagDefinitionId,
              source,
            })),
          });
          break;
        case "SESSION":
          await tx.sessionTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              sessionId: entityId,
              tagDefinitionId,
              source,
            })),
          });
          break;
        case "MEDIA_ITEM":
          await tx.mediaItemTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              mediaItemId: entityId,
              tagDefinitionId,
              source,
            })),
          });
          break;
        case "SET":
          await tx.setTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              setId: entityId,
              tagDefinitionId,
              source,
            })),
          });
          break;
        case "PROJECT":
          await tx.projectTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              projectId: entityId,
              tagDefinitionId,
              source,
            })),
          });
          break;
        case "ARCHIVE_FOLDER":
          await tx.archiveFolderTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              archiveFolderId: entityId,
              tagDefinitionId,
              source,
            })),
          });
          break;
      }
    }
  });
}

// ─── Bulk Operations ────────────────────────────────────────────────────────

/**
 * A folder confirmed to a Set carries its tags on the Set (ADR-0034): split a
 * folder selection into folders that own their tags and the Sets that own the rest.
 */
async function splitFolderOwners(folderIds: string[]): Promise<{ folders: string[]; sets: string[] }> {
  const links = await prisma.archiveLink.findMany({
    where: { archiveFolderId: { in: folderIds }, status: "CONFIRMED", setId: { not: null } },
    select: { archiveFolderId: true, setId: true },
  });
  const onSet = new Set(links.map((l) => l.archiveFolderId));
  return {
    folders: folderIds.filter((id) => !onSet.has(id)),
    sets: [...new Set(links.map((l) => l.setId).filter((id): id is string => !!id))],
  };
}

export async function bulkAddTagsToEntities(
  entityType: TaggableEntity,
  entityIds: string[],
  tagDefinitionIds: string[],
  source: TagSource = "MANUAL",
) {
  if (entityIds.length === 0 || tagDefinitionIds.length === 0) return;
  if (entityType === "ARCHIVE_FOLDER") {
    const { folders, sets } = await splitFolderOwners(entityIds);
    if (sets.length) await bulkAddTagsToEntities("SET", sets, tagDefinitionIds, source);
    entityIds = folders;
    if (entityIds.length === 0) return;
  }

  await prisma.$transaction(
    async (tx) => {
      tagDefinitionIds = await prepareTagIds(tx, entityType, tagDefinitionIds);
      for (const entityId of entityIds) {
        await enforceExclusiveGroups(tx, entityType, entityId, tagDefinitionIds);
        switch (entityType) {
          case "PERSON":
            await tx.personTag.createMany({
              data: tagDefinitionIds.map((tagDefinitionId) => ({ personId: entityId, tagDefinitionId, source })),
              skipDuplicates: true,
            });
            break;
          case "SESSION":
            await tx.sessionTag.createMany({
              data: tagDefinitionIds.map((tagDefinitionId) => ({ sessionId: entityId, tagDefinitionId, source })),
              skipDuplicates: true,
            });
            break;
          case "MEDIA_ITEM":
            await tx.mediaItemTag.createMany({
              data: tagDefinitionIds.map((tagDefinitionId) => ({ mediaItemId: entityId, tagDefinitionId, source })),
              skipDuplicates: true,
            });
            break;
          case "SET":
            await tx.setTag.createMany({
              data: tagDefinitionIds.map((tagDefinitionId) => ({ setId: entityId, tagDefinitionId, source })),
              skipDuplicates: true,
            });
            break;
          case "PROJECT":
            await tx.projectTag.createMany({
              data: tagDefinitionIds.map((tagDefinitionId) => ({ projectId: entityId, tagDefinitionId, source })),
              skipDuplicates: true,
            });
            break;
          case "ARCHIVE_FOLDER":
            await tx.archiveFolderTag.createMany({
              data: tagDefinitionIds.map((tagDefinitionId) => ({ archiveFolderId: entityId, tagDefinitionId, source })),
              skipDuplicates: true,
            });
            break;
        }
          }
    },
    { timeout: 30000 },
  );
}

export async function bulkRemoveTagsFromEntities(
  entityType: TaggableEntity,
  entityIds: string[],
  tagDefinitionIds: string[],
) {
  if (entityIds.length === 0 || tagDefinitionIds.length === 0) return;
  if (entityType === "ARCHIVE_FOLDER") {
    const { folders, sets } = await splitFolderOwners(entityIds);
    if (sets.length) await bulkRemoveTagsFromEntities("SET", sets, tagDefinitionIds);
    entityIds = folders;
    if (entityIds.length === 0) return;
  }

  await prisma.$transaction(
    async (tx) => {
      const where = { tagDefinitionId: { in: tagDefinitionIds } };
      for (const entityId of entityIds) {
        switch (entityType) {
          case "PERSON":
            await tx.personTag.deleteMany({ where: { personId: entityId, ...where } });
            break;
          case "SESSION":
            await tx.sessionTag.deleteMany({ where: { sessionId: entityId, ...where } });
            break;
          case "MEDIA_ITEM":
            await tx.mediaItemTag.deleteMany({ where: { mediaItemId: entityId, ...where } });
            break;
          case "SET":
            await tx.setTag.deleteMany({ where: { setId: entityId, ...where } });
            break;
          case "PROJECT":
            await tx.projectTag.deleteMany({ where: { projectId: entityId, ...where } });
            break;
          case "ARCHIVE_FOLDER":
            await tx.archiveFolderTag.deleteMany({ where: { archiveFolderId: entityId, ...where } });
            break;
        }
          }
    },
    { timeout: 30000 },
  );
}

// ─── Read ───────────────────────────────────────────────────────────────────

export async function getEntityTags(
  entityType: TaggableEntity,
  entityId: string,
): Promise<TagDefinitionWithGroup[]> {
  const include = {
    tagDefinition: {
      include: {
        group: { select: GROUP_SELECT },
        aliases: { select: { name: true } },
      },
    },
  };

  let rows: Array<{ tagDefinition: TagDefinitionWithGroup }>;

  switch (entityType) {
    case "PERSON":
      rows = await prisma.personTag.findMany({ where: { personId: entityId }, include });
      break;
    case "SESSION":
      rows = await prisma.sessionTag.findMany({ where: { sessionId: entityId }, include });
      break;
    case "MEDIA_ITEM":
      rows = await prisma.mediaItemTag.findMany({ where: { mediaItemId: entityId }, include });
      break;
    case "SET":
      rows = await prisma.setTag.findMany({ where: { setId: entityId }, include });
      break;
    case "PROJECT":
      rows = await prisma.projectTag.findMany({ where: { projectId: entityId }, include });
      break;
    case "ARCHIVE_FOLDER":
      rows = await prisma.archiveFolderTag.findMany({ where: { archiveFolderId: entityId }, include });
      break;
    default:
      rows = [];
  }

  return rows.map((r) => r.tagDefinition);
}

export async function getEntityTagIds(
  entityType: TaggableEntity,
  entityId: string,
): Promise<string[]> {
  const tags = await getEntityTags(entityType, entityId);
  return tags.map((t) => t.id);
}

// ─── Selection state ─────────────────────────────────────────────────────────

/**
 * For a selection of entities: how many of them carry each tag directly.
 * Drives the tri-state bulk palette (all / some / none).
 */
export async function getSelectionTagCounts(
  entityType: TaggableEntity,
  entityIds: string[],
): Promise<Record<string, number>> {
  if (entityIds.length === 0) return {};
  if (entityType === "ARCHIVE_FOLDER") {
    // Per folder: its own tags, or its confirmed Set's
    const rows = await prisma.$queryRaw<Array<{ id: string; cnt: bigint }>>(Prisma.sql`
      SELECT tid AS id, count(DISTINCT fid)::bigint AS cnt FROM (
        SELECT "archiveFolderId" AS fid, "tagDefinitionId" AS tid FROM archive_folder_tag WHERE "archiveFolderId" = ANY(${entityIds})
        UNION ALL
        SELECT l."archiveFolderId", st."tagDefinitionId" FROM "ArchiveLink" l JOIN set_tag st ON st."setId" = l."setId"
        WHERE l."archiveFolderId" = ANY(${entityIds}) AND l.status = 'CONFIRMED'
      ) x GROUP BY tid
    `);
    return Object.fromEntries(rows.map((r) => [r.id, Number(r.cnt)]));
  }
  const t = JOIN_TABLE[entityType];
  const rows = await prisma.$queryRaw<Array<{ id: string; cnt: bigint }>>(Prisma.sql`
    SELECT "tagDefinitionId" AS id, count(*)::bigint AS cnt
    FROM ${Prisma.raw(`"${t.table}"`)}
    WHERE ${Prisma.raw(`"${t.column}"`)} = ANY(${entityIds})
    GROUP BY 1
  `);
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.cnt)]));
}

// Join table + entity column per taggable entity (raw SQL uses the @@map names)
const JOIN_TABLE: Record<TaggableEntity, { table: string; column: string }> = {
  PERSON: { table: "person_tag", column: "personId" },
  SESSION: { table: "session_tag", column: "sessionId" },
  MEDIA_ITEM: { table: "media_item_tag", column: "mediaItemId" },
  SET: { table: "set_tag", column: "setId" },
  PROJECT: { table: "project_tag", column: "projectId" },
  ARCHIVE_FOLDER: { table: "archive_folder_tag", column: "archiveFolderId" },
};
