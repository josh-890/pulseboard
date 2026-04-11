"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { updateResearchSchema } from "@/lib/validations/research";
import {
  createResearchRecord,
  updateResearchRecord,
  deleteResearchRecord,
} from "@/lib/services/research-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createResearchEntry(
  personId: string,
  title: string,
): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    if (!personId || !title.trim()) {
      return { success: false, error: "Person ID and title are required" };
    }
    try {
      const entry = await createResearchRecord(personId, title);
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true, id: entry.id };
    } catch {
      return { success: false, error: "Failed to create research entry" };
    }
  });
}

export async function updateResearchEntry(
  personId: string,
  raw: unknown,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updateResearchSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: "Invalid data" };
    }
    try {
      await updateResearchRecord(parsed.data.id, {
        title: parsed.data.title,
        content: parsed.data.content,
      });
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update research entry" };
    }
  });
}

export async function deleteResearchEntry(
  id: string,
  personId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteResearchRecord(id);
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete research entry" };
    }
  });
}
