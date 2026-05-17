"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  createSavedSearch,
  deleteSavedSearch,
  renameSavedSearch,
  togglePinSavedSearch,
  updateSavedSearchSpec,
} from "@/lib/services/saved-search-service";
import type { FilterSpec } from "@/lib/types/filter-spec";
import type { SimpleActionResult } from "@/lib/types";

type CreateResult = SimpleActionResult & { id?: string };

export async function createSavedSearchAction(
  scope: string,
  name: string,
  filterSpec: FilterSpec,
): Promise<CreateResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (!name.trim()) return { success: false, error: "Name is required" };
      const id = await createSavedSearch({ name, scope, filterSpec });
      revalidatePath("/people");
      return { success: true, id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}

export async function renameSavedSearchAction(id: string, name: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (!name.trim()) return { success: false, error: "Name is required" };
      await renameSavedSearch(id, name);
      revalidatePath("/people");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}

export async function updateSavedSearchSpecAction(
  id: string,
  filterSpec: FilterSpec,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateSavedSearchSpec(id, filterSpec);
      revalidatePath("/people");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}

export async function togglePinSavedSearchAction(
  id: string,
  pinned: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await togglePinSavedSearch(id, pinned);
      revalidatePath("/people");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}

export async function deleteSavedSearchAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteSavedSearch(id);
      revalidatePath("/people");
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}
