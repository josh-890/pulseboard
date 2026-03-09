"use server";

import { revalidatePath } from "next/cache";
import type { AliasType, AliasSource } from "@/generated/prisma/client";
import {
  createAlias,
  updateAlias,
  deleteAlias,
  linkAliasToChannels,
  unlinkAliasFromChannel,
  setAliasChannelPrimary,
  bulkImportAliases,
  mergeAliases,
} from "@/lib/services/alias-service";

type ActionResult = { success: boolean; error?: string };

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createAliasAction(
  personId: string,
  data: {
    name: string;
    type?: AliasType;
    source?: AliasSource;
    notes?: string | null;
    channelIds?: string[];
  },
): Promise<ActionResult> {
  try {
    if (!data.name.trim()) {
      return { success: false, error: "Name is required." };
    }
    await createAlias(
      personId,
      data.name.trim(),
      data.type ?? "alias",
      data.source ?? "MANUAL",
      data.notes,
      data.channelIds,
    );
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function updateAliasAction(
  aliasId: string,
  personId: string,
  data: {
    name?: string;
    type?: AliasType;
    notes?: string | null;
  },
): Promise<ActionResult> {
  try {
    await updateAlias(aliasId, data);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function deleteAliasAction(
  aliasId: string,
  personId: string,
): Promise<ActionResult> {
  try {
    await deleteAlias(aliasId);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Channel Links ──────────────────────────────────────────────────────────

export async function linkAliasChannelsAction(
  aliasId: string,
  personId: string,
  channelIds: string[],
): Promise<ActionResult> {
  try {
    await linkAliasToChannels(aliasId, channelIds);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function unlinkAliasChannelAction(
  aliasId: string,
  personId: string,
  channelId: string,
): Promise<ActionResult> {
  try {
    await unlinkAliasFromChannel(aliasId, channelId);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function setAliasChannelPrimaryAction(
  aliasId: string,
  personId: string,
  channelId: string,
  isPrimary: boolean,
): Promise<ActionResult> {
  try {
    await setAliasChannelPrimary(aliasId, channelId, isPrimary);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Bulk Import ────────────────────────────────────────────────────────────

export async function bulkImportAliasesAction(
  personId: string,
  entries: { name: string; channelName?: string }[],
): Promise<{ success: boolean; error?: string; created?: number; linked?: number; unmatched?: string[] }> {
  try {
    const result = await bulkImportAliases(personId, entries);
    revalidatePath(`/people/${personId}`);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

// ─── Merge ──────────────────────────────────────────────────────────────────

export async function mergeAliasesAction(
  targetId: string,
  sourceIds: string[],
  personId: string,
): Promise<ActionResult> {
  try {
    await mergeAliases(targetId, sourceIds);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
  }
}
