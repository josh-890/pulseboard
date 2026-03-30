import { prisma } from "@/lib/db";
import type { TagSource } from "@/generated/prisma/client";
import type { TagDefinitionWithGroup } from "./tag-service";

export type TaggableEntity = "PERSON" | "SESSION" | "MEDIA_ITEM" | "SET" | "PROJECT";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const GROUP_SELECT = { id: true, name: true, slug: true, color: true, isExclusive: true } as const;

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
    }
    await syncEntityTagCacheTx(tx, entityType, entityId);
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
    }
    await syncEntityTagCacheTx(tx, entityType, entityId);
  });
}

export async function setEntityTags(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
  source: TagSource = "MANUAL",
) {
  await prisma.$transaction(async (tx) => {
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
      }
    }
    await syncEntityTagCacheTx(tx, entityType, entityId);
  });
}

// ─── Bulk Operations ────────────────────────────────────────────────────────

export async function bulkAddTagsToEntities(
  entityType: TaggableEntity,
  entityIds: string[],
  tagDefinitionIds: string[],
  source: TagSource = "MANUAL",
) {
  if (entityIds.length === 0 || tagDefinitionIds.length === 0) return;

  await prisma.$transaction(
    async (tx) => {
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
        }
        await syncEntityTagCacheTx(tx, entityType, entityId);
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
        }
        await syncEntityTagCacheTx(tx, entityType, entityId);
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

// ─── Cache Sync ─────────────────────────────────────────────────────────────

async function syncEntityTagCacheTx(
  tx: TxClient,
  entityType: TaggableEntity,
  entityId: string,
) {
  const include = { tagDefinition: { select: { name: true } } };
  let tagNames: string[];

  switch (entityType) {
    case "PERSON": {
      const rows = await tx.personTag.findMany({ where: { personId: entityId }, include });
      tagNames = rows.map((r) => r.tagDefinition.name);
      await tx.person.update({ where: { id: entityId }, data: { tags: tagNames } });
      break;
    }
    case "SESSION": {
      const rows = await tx.sessionTag.findMany({ where: { sessionId: entityId }, include });
      tagNames = rows.map((r) => r.tagDefinition.name);
      await tx.session.update({ where: { id: entityId }, data: { tags: tagNames } });
      break;
    }
    case "MEDIA_ITEM": {
      const rows = await tx.mediaItemTag.findMany({ where: { mediaItemId: entityId }, include });
      tagNames = rows.map((r) => r.tagDefinition.name);
      await tx.mediaItem.update({ where: { id: entityId }, data: { tags: tagNames } });
      break;
    }
    case "SET": {
      const rows = await tx.setTag.findMany({ where: { setId: entityId }, include });
      tagNames = rows.map((r) => r.tagDefinition.name);
      await tx.set.update({ where: { id: entityId }, data: { tags: tagNames } });
      break;
    }
    case "PROJECT": {
      const rows = await tx.projectTag.findMany({ where: { projectId: entityId }, include });
      tagNames = rows.map((r) => r.tagDefinition.name);
      await tx.project.update({ where: { id: entityId }, data: { tags: tagNames } });
      break;
    }
  }
}

export async function syncEntityTagCache(
  entityType: TaggableEntity,
  entityId: string,
) {
  await prisma.$transaction(async (tx) => {
    await syncEntityTagCacheTx(tx, entityType, entityId);
  });
}

export async function bulkSyncTagCaches(
  entityType: TaggableEntity,
  entityIds: string[],
) {
  for (const entityId of entityIds) {
    await syncEntityTagCache(entityType, entityId);
  }
}
