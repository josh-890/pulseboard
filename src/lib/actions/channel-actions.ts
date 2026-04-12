"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { createChannelSchema, updateChannelSchema } from "@/lib/validations/channel";
import {
  createChannelRecord,
  updateChannelRecord,
  deleteChannelRecord,
  addChannelImportAlias,
  removeChannelImportAlias,
} from "@/lib/services/channel-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createChannel(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = createChannelSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      const channel = await createChannelRecord({
        ...parsed.data,
        url: parsed.data.url || undefined,
        channelFolder: parsed.data.channelFolder || undefined,
      });
      revalidatePath("/channels");
      revalidatePath("/labels");
      revalidatePath(`/labels/${parsed.data.labelId}`);
      return { success: true, id: channel.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }

  });
}

export async function updateChannel(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updateChannelSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      await updateChannelRecord(parsed.data.id, {
        ...parsed.data,
        shortName: parsed.data.shortName || null,
        channelFolder: parsed.data.channelFolder || null,
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

  });
}

export async function deleteChannel(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteChannelRecord(id);
      revalidatePath("/channels");
      revalidatePath("/labels");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete channel" };
    }

  });
}

export async function addImportAlias(channelId: string, alias: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addChannelImportAlias(channelId, alias);
      revalidatePath(`/channels/${channelId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to add import alias" };
    }
  });
}

export async function removeImportAlias(channelId: string, alias: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeChannelImportAlias(channelId, alias);
      revalidatePath(`/channels/${channelId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to remove import alias" };
    }
  });
}
