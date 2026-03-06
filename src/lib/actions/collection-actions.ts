"use server";

import { revalidatePath } from "next/cache";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  addToCollection,
  removeFromCollection,
} from "@/lib/services/collection-service";

type ActionResult = { success: boolean; error?: string; id?: string };

export async function createCollectionAction(
  personId: string | null,
  name: string,
  description?: string,
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await removeFromCollection(collectionId, mediaItemIds);
    revalidatePath("/collections");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
