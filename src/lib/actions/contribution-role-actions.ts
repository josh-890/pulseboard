"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
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
import type { SimpleActionResult } from "@/lib/types";

export async function createContributionRoleGroupAction(
  name: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await createContributionRoleGroup({ name });
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateContributionRoleGroupAction(
  id: string,
  data: { name?: string },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateContributionRoleGroup(id, data);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteContributionRoleGroupAction(
  id: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteContributionRoleGroup(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function createContributionRoleDefinitionAction(
  groupId: string,
  name: string,
  description?: string | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await createContributionRoleDefinition({ groupId, name, description });
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateContributionRoleDefinitionAction(
  id: string,
  data: { name?: string; description?: string | null },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateContributionRoleDefinition(id, data);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteContributionRoleDefinitionAction(
  id: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteContributionRoleDefinition(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function reorderContributionRoleGroupsAction(
  orderedIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderContributionRoleGroups(orderedIds);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function reorderContributionRoleDefinitionsAction(
  orderedIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderContributionRoleDefinitions(orderedIds);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}
