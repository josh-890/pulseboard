"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { createDigitalIdentitySchema, updateDigitalIdentitySchema } from "@/lib/validations/digital-identity";
import {
  createDigitalIdentity,
  updateDigitalIdentity,
  deleteDigitalIdentity,
} from "@/lib/services/digital-identity-service";
import type { SimpleActionResult } from "@/lib/types";

export async function createDigitalIdentityAction(raw: unknown): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = createDigitalIdentitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    try {
      await createDigitalIdentity(parsed.data);
      revalidatePath(`/people/${parsed.data.personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to create digital identity" };
    }
  });
}

export async function updateDigitalIdentityAction(
  raw: unknown,
  personId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updateDigitalIdentitySchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
    }

    try {
      await updateDigitalIdentity(parsed.data.id, parsed.data);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update digital identity" };
    }
  });
}

export async function deleteDigitalIdentityAction(
  id: string,
  personId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteDigitalIdentity(id);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete digital identity" };
    }
  });
}
