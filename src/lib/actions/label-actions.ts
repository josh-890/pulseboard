"use server";

import { revalidatePath } from "next/cache";
import { createLabelSchema, updateLabelSchema } from "@/lib/validations/label";
import {
  createLabelRecord,
  updateLabelRecord,
  deleteLabelRecord,
} from "@/lib/services/label-service";

type ActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

type DeleteResult = { success: boolean; error?: string };

export async function createLabel(raw: unknown): Promise<ActionResult> {
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
}

export async function updateLabel(raw: unknown): Promise<ActionResult> {
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
}

export async function deleteLabel(id: string): Promise<DeleteResult> {
  try {
    await deleteLabelRecord(id);
    revalidatePath("/labels");
    revalidatePath("/channels");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete label" };
  }
}
