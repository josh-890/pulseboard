"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  addToCollection,
  removeFromCollection,
  reorderCollection,
  convertCollectionToFavorites,
  setTargetCollection,
  type CollectionLayout,
} from "@/lib/services/collection-service";
import type { SimpleActionResult } from "@/lib/types";

type ActionResultWithId = SimpleActionResult & { id?: string };

// ADR-0019: mark every image in a collection as a global favorite (to retire a
// hand-made FAV collection). Returns the converted count via `id` is not apt; use a count field.
export async function convertCollectionToFavoritesAction(
  collectionId: string,
): Promise<SimpleActionResult & { count?: number }> {
  return withTenantFromHeaders(async () => {
    try {
      const count = await convertCollectionToFavorites(collectionId);
      revalidatePath("/favorites");
      revalidatePath(`/collections/${collectionId}`);
      return { success: true, count };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// ADR-0019: designate (or clear) the one-key quick-add target collection.
export async function setTargetCollectionAction(
  collectionId: string | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setTargetCollection(collectionId);
      revalidatePath("/collections");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

export async function createCollectionAction(
  personId: string | null,
  name: string,
  description?: string,
  layout?: CollectionLayout,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const id = await createCollection({
        name,
        description,
        personId: personId ?? undefined,
        layout,
      });
      revalidatePath("/collections");
      if (personId) {
        revalidatePath("/people");
        revalidatePath(`/people/${personId}`);
      }
      return { success: true, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// Create a new collection and seed it with one media item in a single round-trip.
// Used by the lightbox "create new collection" affordances. `personId` defaults to
// null (a global collection, like the New Collection button).
export async function createCollectionWithItemAction(
  name: string,
  mediaItemId: string,
  personId: string | null = null,
): Promise<ActionResultWithId & { name?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const trimmed = name.trim();
      if (!trimmed) return { success: false, error: "Name is required" };
      const id = await createCollection({ name: trimmed, personId: personId ?? undefined, layout: "GRID" });
      await addToCollection(id, [mediaItemId]);
      revalidatePath("/collections");
      if (personId) {
        revalidatePath("/people");
        revalidatePath(`/people/${personId}`);
      }
      return { success: true, id, name: trimmed };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

export async function updateCollectionAction(
  collectionId: string,
  data: { name?: string; description?: string; layout?: CollectionLayout },
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await updateCollection(collectionId, data);
      revalidatePath("/collections");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteCollectionAction(
  collectionId: string,
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteCollection(collectionId);
      revalidatePath("/collections");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function addToCollectionAction(
  collectionId: string,
  mediaItemIds: string[],
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await addToCollection(collectionId, mediaItemIds);
      revalidatePath("/collections");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function reorderCollectionAction(
  collectionId: string,
  orderedMediaItemIds: string[],
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderCollection(collectionId, orderedMediaItemIds);
      revalidatePath("/collections");
      revalidatePath(`/collections/${collectionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

export async function removeFromCollectionAction(
  collectionId: string,
  mediaItemIds: string[],
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      await removeFromCollection(collectionId, mediaItemIds);
      revalidatePath("/collections");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}
