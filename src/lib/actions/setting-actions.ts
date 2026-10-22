"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  HERO_BACKDROP_KEY,
  setSetting,
} from "@/lib/services/setting-service";
import type { SimpleActionResult } from "@/lib/types";

export async function updateHeroBackdropAction(
  enabled: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setSetting(HERO_BACKDROP_KEY, enabled ? "true" : "false");
      revalidatePath("/settings");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update backdrop setting" };
    }

  });
}
