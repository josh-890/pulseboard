"use server";

import { revalidatePath } from "next/cache";
import { createChannelSchema, updateChannelSchema } from "@/lib/validations/channel";
import {
  createChannelRecord,
  updateChannelRecord,
  deleteChannelRecord,
} from "@/lib/services/channel-service";

type ActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

type DeleteResult = { success: boolean; error?: string };

export async function createChannel(raw: unknown): Promise<ActionResult> {
  const parsed = createChannelSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    const channel = await createChannelRecord({
      ...parsed.data,
      url: parsed.data.url || undefined,
    });
    revalidatePath("/channels");
    revalidatePath("/labels");
    revalidatePath(`/labels/${parsed.data.labelId}`);
    return { success: true, id: channel.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function updateChannel(raw: unknown): Promise<ActionResult> {
  const parsed = updateChannelSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    await updateChannelRecord(parsed.data.id, {
      ...parsed.data,
      url: parsed.data.url || null,
      platform: parsed.data.platform || null,
    });
    revalidatePath("/channels");
    revalidatePath(`/channels/${parsed.data.id}`);
    revalidatePath("/labels");
    return { success: true, id: parsed.data.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function deleteChannel(id: string): Promise<DeleteResult> {
  try {
    await deleteChannelRecord(id);
    revalidatePath("/channels");
    revalidatePath("/labels");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete channel" };
  }
}
