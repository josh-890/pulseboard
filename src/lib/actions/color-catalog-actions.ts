"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  createColorCatalogEntry,
  deleteColorCatalogEntry,
  updateColorCatalogEntry,
  type ColorCatalogInput,
  type ColorCatalogUpdate,
} from "@/lib/services/color-catalog-service";
import { rebuildAllCurrentState } from "@/lib/services/current-state-service";
import type { ColorCategory } from "@/lib/constants/color-catalog";
import type { SimpleActionResult } from "@/lib/types";

type CreateResult = SimpleActionResult & { valueNorm?: string };

export async function createColorCatalogEntryAction(
  category: ColorCategory,
  input: ColorCatalogInput,
): Promise<CreateResult> {
  return withTenantFromHeaders(async () => {
    try {
      const row = await createColorCatalogEntry(category, input);
      // A new catalog value shifts hue/lightness classification; rebuild the
      // PersonCurrentState cache so anyone using this value picks it up.
      await rebuildAllCurrentState();
      revalidatePath("/people");
      revalidatePath("/settings/catalogs/colors");
      return { success: true, valueNorm: row.valueNorm };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}

export async function updateColorCatalogEntryAction(
  category: ColorCategory,
  valueNorm: string,
  patch: ColorCatalogUpdate,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateColorCatalogEntry(category, valueNorm, patch);
      await rebuildAllCurrentState();
      revalidatePath("/people");
      revalidatePath("/settings/catalogs/colors");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}

export async function deleteColorCatalogEntryAction(
  category: ColorCategory,
  valueNorm: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteColorCatalogEntry(category, valueNorm);
      await rebuildAllCurrentState();
      revalidatePath("/people");
      revalidatePath("/settings/catalogs/colors");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}
