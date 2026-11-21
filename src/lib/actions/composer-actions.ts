"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import { applyComposition, ensureStateCombination } from "@/lib/services/composer-service";

// Tag Composer writes (ADR-0042). No type exports from a "use server" file —
// the result shapes are written inline.

export async function applyCompositionAction(
  mediaIds: string[],
  adds: string[],
  removes: string[],
): Promise<{ success: true; tags: Record<string, string[]> } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const tags = await applyComposition(mediaIds, adds, removes);
      revalidatePath("/sets", "layout");
      revalidatePath("/sessions", "layout");
      return { success: true, tags };
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
