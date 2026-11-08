"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { createLabelSchema, updateLabelSchema } from "@/lib/validations/label";
import {
  createLabelRecord,
  updateLabelRecord,
  deleteLabelRecord,
  setLabelRating,
  setLabelText,
} from "@/lib/services/label-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createLabel(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = createLabelSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      const label = await createLabelRecord({
        ...parsed.data,
        website: parsed.data.website || undefined,
      });
      revalidatePath("/labels");
      return { success: true, id: label.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }

  });
}

export async function updateLabel(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updateLabelSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      await updateLabelRecord(parsed.data.id, {
        ...parsed.data,
        website: parsed.data.website || null,
      });
      revalidatePath("/labels");
      revalidatePath(`/labels/${parsed.data.id}`);
      return { success: true, id: parsed.data.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }

  });
}

export async function deleteLabel(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteLabelRecord(id);
      revalidatePath("/labels");
      revalidatePath("/channels");
      return { success: true };
    } catch (err) {
      // Surface the lifecycle-guard message (ADR-0025) rather than a generic string.
      return { success: false, error: err instanceof Error ? err.message : "Failed to delete label" };
    }

  });
}

// ─── Label page (2026-11-08) ─────────────────────────────────────────────────

export async function setLabelRatingAction(labelId: string, rating: number | null): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setLabelRating(labelId, rating);
      revalidatePath(`/labels/${labelId}`);
      revalidatePath("/labels");
      return { success: true };
    } catch (err) {
      console.error("[setLabelRatingAction]", err);
      return { success: false, error: "Could not save the rating" };
    }
  });
}

export async function setLabelTextAction(
  labelId: string,
  field: "description" | "notes",
  text: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (field !== "description" && field !== "notes") return { success: false, error: "Unknown field" };
    try {
      await setLabelText(labelId, field, text);
      revalidatePath(`/labels/${labelId}`);
      return { success: true };
    } catch (err) {
      console.error("[setLabelTextAction]", err);
      return { success: false, error: "Could not save" };
    }
  });
}
