"use server";

import { revalidatePath } from "next/cache";
import {
  createContributionRoleGroup,
  updateContributionRoleGroup,
  deleteContributionRoleGroup,
  createContributionRoleDefinition,
  updateContributionRoleDefinition,
  deleteContributionRoleDefinition,
  reorderContributionRoleGroups,
  reorderContributionRoleDefinitions,
} from "@/lib/services/contribution-role-service";

type ActionResult = { success: boolean; error?: string };

export async function createContributionRoleGroupAction(
  name: string,
): Promise<ActionResult> {
  try {
    await createContributionRoleGroup({ name });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateContributionRoleGroupAction(
  id: string,
  data: { name?: string },
): Promise<ActionResult> {
  try {
    await updateContributionRoleGroup(id, data);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteContributionRoleGroupAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteContributionRoleGroup(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function createContributionRoleDefinitionAction(
  groupId: string,
  name: string,
  description?: string | null,
): Promise<ActionResult> {
  try {
    await createContributionRoleDefinition({ groupId, name, description });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateContributionRoleDefinitionAction(
  id: string,
  data: { name?: string; description?: string | null },
): Promise<ActionResult> {
  try {
    await updateContributionRoleDefinition(id, data);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteContributionRoleDefinitionAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteContributionRoleDefinition(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function reorderContributionRoleGroupsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await reorderContributionRoleGroups(orderedIds);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function reorderContributionRoleDefinitionsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await reorderContributionRoleDefinitions(orderedIds);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
