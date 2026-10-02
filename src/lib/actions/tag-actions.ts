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
  createSlotSet,
  deleteSlotSet,
  renameSlotSet,
  setActiveSlotSet,
  setSlot,
} from "@/lib/services/tag-slot-service";
import {
  createTagGroupSchema,
  updateTagGroupSchema,
  createTagDefinitionSchema,
  updateTagDefinitionSchema,
  createTagAliasSchema,
  type CreateTagGroupInput,
  type UpdateTagGroupInput,
  type CreateTagDefinitionInput,
  type UpdateTagDefinitionInput,
} from "@/lib/validations/tag";

type SimpleActionResult = { success: boolean; error?: string };

// ─── Group CRUD ─────────────────────────────────────────────────────────────

export async function createTagGroupAction(input: CreateTagGroupInput): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const data = createTagGroupSchema.parse(input);
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
  data: UpdateTagGroupInput,
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
  input: CreateTagDefinitionInput,
): Promise<SimpleActionResult & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const data = createTagDefinitionSchema.parse(input);
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
  data: UpdateTagDefinitionInput,
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

// ─── Inline Tag Creation ────────────────────────────────────────────────────

/**
 * Create a tag from the picker/palette while tagging. Active at once (no
 * pending review — ADR-0033); the caller names the group. Apply it to the
 * entity with the usual add action afterwards.
 */
export async function createInlineTagAction(
  groupId: string,
  name: string,
): Promise<SimpleActionResult & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const data = createTagDefinitionSchema.parse({ groupId, name: name.trim() });
      const tag = await createTagDefinition(data);
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

// ─── Quick-tag slot sets (S3) ───────────────────────────────────────────────

export async function setSlotAction(
  slotSetId: string,
  position: number,
  tagDefinitionId: string | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setSlot(slotSetId, position, tagDefinitionId);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to set slot" };
    }
  });
}

export async function createSlotSetAction(name: string): Promise<SimpleActionResult & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      if (!name.trim()) return { success: false, error: "Name required" };
      const id = await createSlotSet(name);
      return { success: true, id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to create slot set" };
    }
  });
}

export async function renameSlotSetAction(id: string, name: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (!name.trim()) return { success: false, error: "Name required" };
      await renameSlotSet(id, name);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to rename slot set" };
    }
  });
}

export async function deleteSlotSetAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteSlotSet(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to delete slot set" };
    }
  });
}

export async function setActiveSlotSetAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setActiveSlotSet(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to switch slot set" };
    }
  });
}
