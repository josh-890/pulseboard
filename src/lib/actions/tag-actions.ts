"use server";

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
} from "@/lib/services/tag-service";
import {
  addTagsToEntity,
  removeTagsFromEntity,
  setEntityTags,
} from "@/lib/services/entity-tag-service";
import type { TaggableEntity } from "@/lib/services/entity-tag-service";
import {
  createTagGroupSchema,
  updateTagGroupSchema,
  createTagDefinitionSchema,
  updateTagDefinitionSchema,
} from "@/lib/validations/tag";

type SimpleActionResult = { success: boolean; error?: string };

// ─── Group CRUD ─────────────────────────────────────────────────────────────

export async function createTagGroupAction(
  name: string,
  color?: string,
  description?: string,
): Promise<SimpleActionResult> {
  try {
    const data = createTagGroupSchema.parse({ name, color, description });
    await createTagGroup(data);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create tag group" };
  }
}

export async function updateTagGroupAction(
  id: string,
  data: { name?: string; color?: string; description?: string | null },
): Promise<SimpleActionResult> {
  try {
    const validated = updateTagGroupSchema.parse(data);
    await updateTagGroup(id, validated);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update tag group" };
  }
}

export async function deleteTagGroupAction(id: string): Promise<SimpleActionResult> {
  try {
    await deleteTagGroup(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete tag group" };
  }
}

export async function reorderTagGroupsAction(orderedIds: string[]): Promise<SimpleActionResult> {
  try {
    await reorderTagGroups(orderedIds);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to reorder groups" };
  }
}

// ─── Definition CRUD ────────────────────────────────────────────────────────

export async function createTagDefinitionAction(
  groupId: string,
  name: string,
  scope?: string[],
): Promise<SimpleActionResult & { id?: string }> {
  try {
    const data = createTagDefinitionSchema.parse({ groupId, name, scope });
    const tag = await createTagDefinition(data);
    revalidatePath("/settings");
    return { success: true, id: tag.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create tag" };
  }
}

export async function updateTagDefinitionAction(
  id: string,
  data: { name?: string; scope?: string[]; sortOrder?: number },
): Promise<SimpleActionResult> {
  try {
    const validated = updateTagDefinitionSchema.parse(data);
    await updateTagDefinition(id, validated);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update tag" };
  }
}

export async function deleteTagDefinitionAction(id: string): Promise<SimpleActionResult> {
  try {
    await deleteTagDefinition(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete tag" };
  }
}

export async function mergeTagDefinitionsAction(
  sourceIds: string[],
  targetId: string,
): Promise<SimpleActionResult> {
  try {
    await mergeTagDefinitions(sourceIds, targetId);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to merge tags" };
  }
}

export async function reorderTagDefinitionsAction(orderedIds: string[]): Promise<SimpleActionResult> {
  try {
    await reorderTagDefinitions(orderedIds);
    revalidatePath("/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to reorder tags" };
  }
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
      // Media items are displayed within sessions — revalidate broadly
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
  try {
    await addTagsToEntity(entityType, entityId, tagDefinitionIds, "MANUAL");
    revalidateEntity(entityType, entityId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to add tags" };
  }
}

export async function removeTagsFromEntityAction(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  try {
    await removeTagsFromEntity(entityType, entityId, tagDefinitionIds);
    revalidateEntity(entityType, entityId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove tags" };
  }
}

export async function setEntityTagsAction(
  entityType: TaggableEntity,
  entityId: string,
  tagDefinitionIds: string[],
): Promise<SimpleActionResult> {
  try {
    await setEntityTags(entityType, entityId, tagDefinitionIds, "MANUAL");
    revalidateEntity(entityType, entityId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to set tags" };
  }
}
