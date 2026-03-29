import { prisma } from "@/lib/db";
import type { TagSource } from "@/generated/prisma/client";
import type { TagDefinitionWithGroup } from "./tag-service";

export type TaggableEntity = "PERSON" | "SESSION" | "MEDIA_ITEM" | "SET" | "PROJECT";

// ─── Core Operations ────────────────────────────────────────────────────────

export async function addTagsToEntity(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
  source: TagSource = "MANUAL",
) {
  if (tagDefinitionIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
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
        if (tagDefinitionIds.length > 0) {
          await tx.personTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              personId: entityId,
              tagDefinitionId,
              source,
            })),
          });
        }
        break;
      case "SESSION":
        await tx.sessionTag.deleteMany({ where: { sessionId: entityId } });
        if (tagDefinitionIds.length > 0) {
          await tx.sessionTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              sessionId: entityId,
              tagDefinitionId,
              source,
            })),
          });
        }
        break;
      case "MEDIA_ITEM":
        await tx.mediaItemTag.deleteMany({ where: { mediaItemId: entityId } });
        if (tagDefinitionIds.length > 0) {
          await tx.mediaItemTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              mediaItemId: entityId,
              tagDefinitionId,
              source,
            })),
          });
        }
        break;
      case "SET":
        await tx.setTag.deleteMany({ where: { setId: entityId } });
        if (tagDefinitionIds.length > 0) {
          await tx.setTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              setId: entityId,
              tagDefinitionId,
              source,
            })),
          });
        }
        break;
      case "PROJECT":
        await tx.projectTag.deleteMany({ where: { projectId: entityId } });
        if (tagDefinitionIds.length > 0) {
          await tx.projectTag.createMany({
            data: tagDefinitionIds.map((tagDefinitionId) => ({
              projectId: entityId,
              tagDefinitionId,
              source,
            })),
          });
        }
        break;
    }
    await syncEntityTagCacheTx(tx, entityType, entityId);
  });
}

// ─── Read ───────────────────────────────────────────────────────────────────

export async function getEntityTags(
  entityType: TaggableEntity,
  entityId: string,
): Promise<TagDefinitionWithGroup[]> {
  const include = {
    tagDefinition: {
      include: {
        group: { select: { id: true, name: true, slug: true, color: true } },
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

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
