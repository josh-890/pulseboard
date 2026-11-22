"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { getBodyFeaturesInRegions, regionIdsOfTags, type ComposerBodyFeature } from "@/lib/services/composer-bridge-service";
import { applyComposition, ensureStateCombination } from "@/lib/services/composer-service";
import { deleteComposerPreset, getComposerPresets, saveComposerPreset } from "@/lib/services/composer-preset-service";

// Tag Composer writes (ADR-0042). No type exports from a "use server" file —
// the result shapes are written inline.

export async function applyCompositionAction(
  mediaIds: string[],
  adds: string[],
  removes: string[],
  /** A person lane (ADR-0043): the change is attributed to this person */
  personId: string | null = null,
): Promise<
  | { success: true; tags: Record<string, string[]>; persons: Record<string, Record<string, string[]>> }
  | { success: false; error: string }
> {
  return withTenantFromHeaders(async () => {
    try {
      const { tags, persons } = await applyComposition(mediaIds, adds, removes, personId);
      revalidatePath("/sets", "layout");
      revalidatePath("/sessions", "layout");
      return { success: true, tags, persons };
    } catch (err) {
      console.error("[composer] apply failed", err);
      return { success: false, error: err instanceof Error ? err.message : "Could not write the tags" };
    }
  });
}

export async function ensureStateCombinationAction(
  stateGroupId: string,
  garmentTagId: string,
): Promise<
  | { success: true; tag: { id: string; name: string; description: string | null; groupId: string; parentIds: string[] } }
  | { success: false; error: string }
> {
  return withTenantFromHeaders(async () => {
    try {
      const tag = await ensureStateCombination(stateGroupId, garmentTagId);
      return { success: true, tag };
    } catch (err) {
      console.error("[composer] combination failed", err);
      return { success: false, error: err instanceof Error ? err.message : "Could not create the combination" };
    }
  });
}

export async function getComposerPresetsAction() {
  return withTenantFromHeaders(() => getComposerPresets());
}

export async function saveComposerPresetAction(
  name: string,
  adds: string[],
  removes: string[],
): Promise<{ success: true; preset: { id: string; name: string; adds: string[]; removes: string[] } } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      return { success: true, preset: await saveComposerPreset(name, { adds, removes }) };
    } catch (err) {
      console.error("[composer] preset save failed", err);
      return { success: false, error: err instanceof Error ? err.message : "Could not save the preset" };
    }
  });
}

export async function deleteComposerPresetAction(id: string): Promise<{ success: true } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteComposerPreset(id);
      return { success: true };
    } catch (err) {
      console.error("[composer] preset delete failed", err);
      return { success: false, error: "Could not delete the preset" };
    }
  });
}

/** The Detail tier's bridge (ADR-0043): the person's marks and modifications in the regions tagged */
export async function getComposerBodyFeaturesAction(
  personId: string,
  regionTagIds: string[],
): Promise<{ success: true; features: ComposerBodyFeature[] } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const regions = await regionIdsOfTags(regionTagIds);
      return { success: true, features: await getBodyFeaturesInRegions(personId, regions) };
    } catch (err) {
      console.error("getComposerBodyFeaturesAction", err);
      return { success: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });
}
