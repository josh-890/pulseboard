"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { createChannelSchema, NEW_LABEL, updateChannelSchema } from "@/lib/validations/channel";
import {
  createChannelRecord,
  updateChannelRecord,
  deleteChannelRecord,
  addChannelImportAlias,
  removeChannelImportAlias,
  ImportAliasTakenError,
  LabelExistsError,
} from "@/lib/services/channel-service";
import { rejectNameOnlyLink } from "@/lib/services/channel-check-service";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createChannel(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = createChannelSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      const newLabel = parsed.data.labelId === NEW_LABEL;
      const channel = await createChannelRecord({
        ...parsed.data,
        labelId: newLabel ? undefined : parsed.data.labelId,
        newLabel,
        url: parsed.data.url || undefined,
        channelFolder: parsed.data.channelFolder || undefined,
      });
      revalidatePath("/channels");
      revalidatePath("/labels");
      if (channel.labelId) revalidatePath(`/labels/${channel.labelId}`);
      return { success: true, id: channel.id };
    } catch (err) {
      if (err instanceof LabelExistsError) return { success: false, error: err.message };
      console.error("[createChannel]", err);
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
        repointSessions: parsed.data.repointSessions,
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
      revalidatePath("/channels/check");
      return { success: true };
    } catch (err) {
      if (err instanceof ImportAliasTakenError) return { success: false, error: err.message };
      console.error("[addImportAlias]", err);
      return { success: false, error: "Failed to add import alias" };
    }
  });
}

export async function removeImportAlias(channelId: string, alias: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeChannelImportAlias(channelId, alias);
      revalidatePath(`/channels/${channelId}`);
      revalidatePath("/channels/check");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to remove import alias" };
    }
  });
}

export async function updateChannelFolderAction(
  channelId: string,
  folderName: string | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateChannelRecord(channelId, { channelFolder: folderName || null });
      revalidatePath(`/channels/${channelId}`);
      revalidatePath("/channels");
      revalidatePath("/channels/check");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update archive folder name" };
    }
  });
}

// ── Channel check (ADR-0038) ────────────────────────────────────────────────

export type ChannelLinkResult = { success: true; count: number } | { success: false; error: string };

/** Link a channel name to a channel by recording it as an import alias; connects waiting staged sets. */
export async function linkChannelNameAction(channelId: string, channelName: string): Promise<ChannelLinkResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { connected } = await addChannelImportAlias(channelId, channelName);
      revalidatePath("/channels/check");
      revalidatePath(`/channels/${channelId}`);
      revalidatePath("/staging-sets");
      return { success: true, count: connected };
    } catch (err) {
      if (err instanceof ImportAliasTakenError) return { success: false, error: err.message };
      console.error("[linkChannelNameAction]", err);
      return { success: false, error: "Failed to link the channel name" };
    }
  });
}

/** "Not this one": open staged sets that took the channel under this name lose it. */
export async function rejectNameOnlyLinkAction(channelId: string, channelName: string): Promise<ChannelLinkResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { disconnected } = await rejectNameOnlyLink(channelId, channelName);
      revalidatePath("/channels/check");
      revalidatePath("/staging-sets");
      return { success: true, count: disconnected };
    } catch (err) {
      console.error("[rejectNameOnlyLinkAction]", err);
      return { success: false, error: "Failed to disconnect the channel name" };
    }
  });
}
