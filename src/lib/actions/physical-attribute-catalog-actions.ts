"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  createPhysicalAttributeGroup,
  updatePhysicalAttributeGroup,
  deletePhysicalAttributeGroup,
  createPhysicalAttributeDefinition,
  updatePhysicalAttributeDefinition,
  deletePhysicalAttributeDefinition,
} from "@/lib/services/physical-attribute-catalog-service";
import type { SimpleActionResult } from "@/lib/types";
import type {
  AuditTier,
  Mutability,
  PhysicalAttributeValueType,
} from "@/generated/prisma/client";

export type CreateDefinitionInput = {
  groupId: string;
  name: string;
  unit?: string | null;
  valueType?: PhysicalAttributeValueType;
  allowedValues?: string[];
  ordinalMin?: number | null;
  ordinalMax?: number | null;
  mutability?: Mutability;
  statusBearing?: boolean;
  tier?: AuditTier;
};

export type UpdateDefinitionInput = {
  name?: string;
  unit?: string | null;
  sortOrder?: number;
  valueType?: PhysicalAttributeValueType;
  allowedValues?: string[];
  ordinalMin?: number | null;
  ordinalMax?: number | null;
  mutability?: Mutability;
  statusBearing?: boolean;
  tier?: AuditTier;
};

// ─── Group actions ───────────────────────────────────────────────────────────

export async function createPhysicalAttributeGroupAction(
  name: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await createPhysicalAttributeGroup({ name });
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updatePhysicalAttributeGroupAction(
  id: string,
  data: { name?: string; sortOrder?: number },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updatePhysicalAttributeGroup(id, data);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deletePhysicalAttributeGroupAction(
  id: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deletePhysicalAttributeGroup(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// ─── Definition actions ──────────────────────────────────────────────────────

export async function createPhysicalAttributeDefinitionAction(
  input: CreateDefinitionInput,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await createPhysicalAttributeDefinition(input);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updatePhysicalAttributeDefinitionAction(
  id: string,
  data: UpdateDefinitionInput,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updatePhysicalAttributeDefinition(id, data);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deletePhysicalAttributeDefinitionAction(
  id: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deletePhysicalAttributeDefinition(id);
      revalidatePath("/settings");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}
