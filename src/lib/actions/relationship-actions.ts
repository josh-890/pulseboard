"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  createRelationship,
  deleteRelationship,
  type CreateRelationshipInput,
} from "@/lib/services/relationship-service";
import type { SimpleActionResult } from "@/lib/types";

export async function createRelationshipAction(
  input: CreateRelationshipInput,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (!input.personId || !input.roleId) {
      return { success: false, error: "Missing person or role" };
    }
    try {
      await createRelationship(input);
      revalidatePath(`/people/${input.personId}`);
      if (input.counterpartPersonId) revalidatePath(`/people/${input.counterpartPersonId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }
  });
}

export async function deleteRelationshipAction(
  relationshipId: string,
  personId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteRelationship(relationshipId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Unexpected error" };
    }
  });
}
