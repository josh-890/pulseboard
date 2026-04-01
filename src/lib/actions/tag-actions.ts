"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  createTagGroup,
  updateTagGroup,
  deleteTagGroup,
  reorderTagGroups,
  createTagDefinition,
  updateTagDefinition,
  deleteTagDefinition,
  mergeTagDefinitions,
  reorderTagDefinitions,
  approveTag,
  rejectTag,
  createTagAlias,
  deleteTagAlias,
} from "@/lib/services/tag-service";
import {
  addTagsToEntity,
  removeTagsFromEntity,
  setEntityTags,
  bulkAddTagsToEntities,
  bulkRemoveTagsFromEntities,
} from "@/lib/services/entity-tag-service";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import {
  createTagGroupSchema,
  updateTagGroupSchema,
  createTagDefinitionSchema,
  updateTagDefinitionSchema,
  createTagAliasSchema,
} from "@/lib/validations/tag";
import { prisma } from "@/lib/db";

type SimpleActionResult = { success: boolean; error?: string };

// ─── Group CRUD ─────────────────────────────────────────────────────────────

export async function createTagGroupAction(
  name: string,
  color?: string,
  description?: string,
  isExclusive?: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const data = createTagGroupSchema.parse({ name, color, description, isExclusive });
      await createTagGroup(data);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to create tag group" };
    }

  });
}

export async function updateTagGroupAction(
  id: string,
  data: { name?: string; color?: string; description?: string | null; isExclusive?: boolean },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const validated = updateTagGroupSchema.parse(data);
      await updateTagGroup(id, validated);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to update tag group" };
    }

  });
}

export async function deleteTagGroupAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteTagGroup(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to delete tag group" };
    }

  });
}

export async function reorderTagGroupsAction(orderedIds: string[]): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderTagGroups(orderedIds);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to reorder groups" };
    }

  });
}

// ─── Definition CRUD ────────────────────────────────────────────────────────

export async function createTagDefinitionAction(
  groupId: string,
  name: string,
  scope?: string[],
  description?: string,
  status?: string,
): Promise<SimpleActionResult & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const data = createTagDefinitionSchema.parse({ groupId, name, scope, description, status });
      const tag = await createTagDefinition(data);
      revalidatePath("/settings");
      return { success: true, id: tag.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to create tag" };
    }

  });
}

export async function updateTagDefinitionAction(
  id: string,
  data: { name?: string; scope?: string[]; sortOrder?: number; description?: string | null; status?: string },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const validated = updateTagDefinitionSchema.parse(data);
      await updateTagDefinition(id, validated);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to update tag" };
    }

  });
}

export async function deleteTagDefinitionAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteTagDefinition(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to delete tag" };
    }

  });
}

export async function mergeTagDefinitionsAction(
  sourceIds: string[],
  targetId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await mergeTagDefinitions(sourceIds, targetId);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to merge tags" };
    }

  });
}

export async function reorderTagDefinitionsAction(orderedIds: string[]): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderTagDefinitions(orderedIds);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to reorder tags" };
    }

  });
}

// ─── Governance ─────────────────────────────────────────────────────────────

export async function approveTagAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await approveTag(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to approve tag" };
    }

  });
}

export async function rejectTagAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await rejectTag(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to reject tag" };
    }

  });
}

// ─── Inline Tag Creation ────────────────────────────────────────────────────

export async function createInlineTagAction(
  name: string,
  scope: string,
): Promise<SimpleActionResult & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      // Find or create the Uncategorized group
      let uncategorized = await prisma.tagGroup.findFirst({
        where: { slug: "uncategorized" },
      });
      if (!uncategorized) {
        uncategorized = await prisma.tagGroup.create({
          data: {
            name: "Uncategorized",
            slug: "uncategorized",
            color: "#9ca3af",
            description: "Tags not yet assigned to a group",
            sortOrder: 999,
          },
        });
      }

      const tag = await createTagDefinition({
        groupId: uncategorized.id,
        name,
        scope: [scope],
        status: "pending",
      });

      revalidatePath("/settings");
      return { success: true, id: tag.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to create tag" };
    }

  });
}

// ─── Alias CRUD ─────────────────────────────────────────────────────────────

export async function createTagAliasAction(
  tagDefinitionId: string,
  name: string,
): Promise<SimpleActionResult & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const data = createTagAliasSchema.parse({ tagDefinitionId, name });
      const alias = await createTagAlias(data.tagDefinitionId, data.name);
      revalidatePath("/settings");
      return { success: true, id: alias.id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to create alias" };
    }

  });
}

export async function deleteTagAliasAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteTagAlias(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to delete alias" };
    }

  });
}

// ─── Entity Tagging ─────────────────────────────────────────────────────────

function revalidateEntity(entityType: TaggableEntity, entityId: string) {
  switch (entityType) {
    case "PERSON":
      revalidatePath("/people");
      revalidatePath(`/people/${entityId}`);
      break;
    case "SESSION":
      revalidatePath(`/sessions/${entityId}`);
      break;
    case "MEDIA_ITEM":
      break;
    case "SET":
      revalidatePath("/sets");
      revalidatePath(`/sets/${entityId}`);
      break;
    case "PROJECT":
      revalidatePath("/projects");
      revalidatePath(`/projects/${entityId}`);
      break;
  }
}

export async function addTagsToEntityAction(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addTagsToEntity(entityType, entityId, tagDefinitionIds, "MANUAL");
      revalidateEntity(entityType, entityId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to add tags" };
    }

  });
}

export async function removeTagsFromEntityAction(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeTagsFromEntity(entityType, entityId, tagDefinitionIds);
      revalidateEntity(entityType, entityId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to remove tags" };
    }

  });
}

export async function setEntityTagsAction(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setEntityTags(entityType, entityId, tagDefinitionIds, "MANUAL");
      revalidateEntity(entityType, entityId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to set tags" };
    }

  });
}

// ─── Bulk Entity Tagging ────────────────────────────────────────────────────

function revalidateBrowse(entityType: TaggableEntity) {
  switch (entityType) {
    case "PERSON":
      revalidatePath("/people");
      break;
    case "SESSION":
      revalidatePath("/sessions");
      break;
    case "SET":
      revalidatePath("/sets");
      break;
    case "PROJECT":
      revalidatePath("/projects");
      break;
    case "MEDIA_ITEM":
      break;
  }
}

export async function bulkAddTagsToEntitiesAction(
  entityType: TaggableEntity,
  entityIds: string[],
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await bulkAddTagsToEntities(entityType, entityIds, tagDefinitionIds, "MANUAL");
      revalidateBrowse(entityType);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to bulk add tags" };
    }

  });
}

export async function bulkRemoveTagsFromEntitiesAction(
  entityType: TaggableEntity,
  entityIds: string[],
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await bulkRemoveTagsFromEntities(entityType, entityIds, tagDefinitionIds);
      revalidateBrowse(entityType);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to bulk remove tags" };
    }

  });
}
