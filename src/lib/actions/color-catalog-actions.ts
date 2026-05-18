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
import { refreshPersonCurrentState } from "@/lib/services/view-service";
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
      // New value may affect lookups for newly-imported persons; refresh the MV
      // so anyone using this value via free-text data picks up correct hue/shade
      await refreshPersonCurrentState();
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
      await refreshPersonCurrentState();
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
      await refreshPersonCurrentState();
      revalidatePath("/people");
      revalidatePath("/settings/catalogs/colors");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}
