"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import type { AliasSource } from "@/generated/prisma/client";
import {
  createAlias,
  updateAlias,
  branchAliasToNew,
  deleteAlias,
  linkAliasToChannels,
  unlinkAliasFromChannel,
  setAliasChannelPrimary,
  bulkImportAliases,
  mergeAliases,
  promoteAliasFromQueue,
  dismissAliasPromotion,
} from "@/lib/services/alias-service";
import type { SimpleActionResult } from "@/lib/types";

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createAliasAction(
  personId: string,
  data: {
    name: string;
    isCommon?: boolean;
    isBirth?: boolean;
    source?: AliasSource;
    notes?: string | null;
    channelIds?: string[];
  },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (!data.name.trim()) {
        return { success: false, error: "Name is required." };
      }
      await createAlias(
        personId,
        data.name.trim(),
        data.isCommon ?? false,
        data.isBirth ?? false,
        data.source ?? "MANUAL",
        data.notes,
        data.channelIds,
      );
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

export type UpdateAliasActionResult = SimpleActionResult & {
  needsRenameConfirm?: boolean;
  creditCount?: number;
};

export async function updateAliasAction(
  aliasId: string,
  personId: string,
  data: {
    name?: string;
    isCommon?: boolean;
    isBirth?: boolean;
    notes?: string | null;
  },
  // How to resolve an in-use rename (ADR-0024). Omitted → guard may ask.
  mode?: "rename-in-place" | "branch-new",
): Promise<UpdateAliasActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      // Branch to a new alias instead of renaming the in-use one.
      if (mode === "branch-new") {
        if (!data.name?.trim()) return { success: false, error: "Name is required." };
        await branchAliasToNew(aliasId, data.name.trim());
        revalidatePath(`/people/${personId}`);
        return { success: true };
      }

      const res = await updateAlias(aliasId, data, {
        confirmRenameInPlace: mode === "rename-in-place",
      });
      if (res.needsRenameConfirm) {
        return { success: false, needsRenameConfirm: true, creditCount: res.creditCount };
      }
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

export async function deleteAliasAction(
  aliasId: string,
  personId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteAlias(aliasId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

// ─── Channel Links ──────────────────────────────────────────────────────────

export async function linkAliasChannelsAction(
  aliasId: string,
  personId: string,
  channelIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await linkAliasToChannels(aliasId, channelIds);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

export async function unlinkAliasChannelAction(
  aliasId: string,
  personId: string,
  channelId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await unlinkAliasFromChannel(aliasId, channelId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

export async function setAliasChannelPrimaryAction(
  aliasId: string,
  personId: string,
  channelId: string,
  isPrimary: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setAliasChannelPrimary(aliasId, channelId, isPrimary);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

// ─── Bulk Import ────────────────────────────────────────────────────────────

export async function bulkImportAliasesAction(
  personId: string,
  entries: { name: string; channelName?: string }[],
): Promise<{ success: boolean; error?: string; created?: number; linked?: number; unmatched?: string[] }> {
  return withTenantFromHeaders(async () => {
    try {
      const result = await bulkImportAliases(personId, entries);
      revalidatePath(`/people/${personId}`);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}

// ─── Promotion queue (ADR-0024) ─────────────────────────────────────────────

export async function promoteAliasFromQueueAction(
  personId: string,
  channelId: string,
  name: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (!name.trim()) return { success: false, error: "Name is required." };
      await promoteAliasFromQueue(personId, channelId, name.trim());
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }
  });
}

export async function dismissAliasPromotionAction(
  personId: string,
  channelId: string,
  name: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await dismissAliasPromotion(personId, channelId, name);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }
  });
}

// ─── Merge ──────────────────────────────────────────────────────────────────

export async function mergeAliasesAction(
  targetId: string,
  sourceIds: string[],
  personId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await mergeAliases(targetId, sourceIds);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }

  });
}
