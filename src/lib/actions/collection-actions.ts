"use server";

import { revalidatePath } from "next/cache";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  addToCollection,
  removeFromCollection,
} from "@/lib/services/collection-service";
import type { SimpleActionResult } from "@/lib/types";

type ActionResultWithId = SimpleActionResult & { id?: string };

export async function createCollectionAction(
  personId: string | null,
  name: string,
  description?: string,
): Promise<ActionResultWithId> {
  try {
    const id = await createCollection({
      name,
      description,
      personId: personId ?? undefined,
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
}

export async function updateCollectionAction(
  collectionId: string,
  data: { name?: string; description?: string },
): Promise<ActionResultWithId> {
  try {
    await updateCollection(collectionId, data);
    revalidatePath("/collections");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteCollectionAction(
  collectionId: string,
): Promise<ActionResultWithId> {
  try {
    await deleteCollection(collectionId);
    revalidatePath("/collections");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function addToCollectionAction(
  collectionId: string,
  mediaItemIds: string[],
): Promise<ActionResultWithId> {
  try {
    await addToCollection(collectionId, mediaItemIds);
    revalidatePath("/collections");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function removeFromCollectionAction(
  collectionId: string,
  mediaItemIds: string[],
): Promise<ActionResultWithId> {
  try {
    await removeFromCollection(collectionId, mediaItemIds);
    revalidatePath("/collections");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
