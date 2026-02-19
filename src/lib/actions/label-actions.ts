"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createLabelSchema, updateLabelSchema } from "@/lib/validations/label";
import {
  createLabelRecord,
  updateLabelRecord,
  deleteLabelRecord,
  createChannelRecord,
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
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete label" };
  }
}

const createChannelSchema = z.object({
  name: z.string().min(1, "Channel name is required"),
  platform: z.string().optional(),
  url: z.string().optional(),
});

export async function createChannel(
  labelId: string,
  raw: unknown,
): Promise<ActionResult> {
  const parsed = createChannelSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    const channel = await createChannelRecord(labelId, parsed.data);
    revalidatePath("/labels");
    revalidatePath(`/labels/${labelId}`);
    return { success: true, id: channel.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}
