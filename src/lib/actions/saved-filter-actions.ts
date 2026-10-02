"use server";

import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  createSavedFilter,
  deleteSavedFilter,
  freezeSmartCollection,
  importSavedFilters,
  SAVED_FILTER_SCOPES,
  updateSavedFilter,
  type SavedFilterScope,
} from "@/lib/services/saved-filter-service";

type Result = { success: boolean; error?: string };

const PATHS: Record<SavedFilterScope, string> = {
  people: "/people",
  sets: "/sets",
  sessions: "/sessions",
  media: "/collections",
};

function scopeOf(value: string): SavedFilterScope {
  const s = SAVED_FILTER_SCOPES.find((x) => x === value);
  if (!s) throw new Error(`Unknown scope ${value}`);
  return s;
}

const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export async function createSavedFilterAction(
  scope: string,
  name: string,
  params: string,
): Promise<Result & { id?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const s = scopeOf(scope);
      const id = await createSavedFilter(s, name, params);
      revalidatePath(PATHS[s]);
      return { success: true, id };
    } catch (e) {
      return { success: false, error: message(e, "Failed to save") };
    }
  });
}

export async function updateSavedFilterAction(
  id: string,
  scope: string,
  data: { name?: string; params?: string; pinned?: boolean },
): Promise<Result> {
  return withTenantFromHeaders(async () => {
    try {
      const s = scopeOf(scope);
      await updateSavedFilter(id, data);
      revalidatePath(PATHS[s]);
      if (s === "media") revalidatePath(`/collections/smart/${id}`);
      return { success: true };
    } catch (e) {
      return { success: false, error: message(e, "Failed to update") };
    }
  });
}

export async function deleteSavedFilterAction(id: string, scope: string): Promise<Result> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteSavedFilter(id);
      revalidatePath(PATHS[scopeOf(scope)]);
      return { success: true };
    } catch (e) {
      return { success: false, error: message(e, "Failed to delete") };
    }
  });
}

export async function importSavedFiltersAction(
  scope: string,
  views: { name: string; params: string }[],
): Promise<Result & { added?: number }> {
  return withTenantFromHeaders(async () => {
    try {
      const s = scopeOf(scope);
      const added = await importSavedFilters(s, views);
      revalidatePath(PATHS[s]);
      return { success: true, added };
    } catch (e) {
      return { success: false, error: message(e, "Failed to import saved views") };
    }
  });
}

export async function freezeSmartCollectionAction(
  id: string,
  name: string,
): Promise<Result & { collectionId?: string; count?: number }> {
  return withTenantFromHeaders(async () => {
    try {
      const r = await freezeSmartCollection(id, name);
      revalidatePath("/collections");
      return { success: true, ...r };
    } catch (e) {
      return { success: false, error: message(e, "Failed to freeze") };
    }
  });
}
