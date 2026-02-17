"use server";

import { revalidatePath } from "next/cache";
import {
  setFavoritePhoto,
  reorderPhotos as reorderPhotosService,
  deletePhoto,
  updatePhotoTags as updateTagsService,
} from "@/lib/services/photo-service";
import {
  setFavoriteSchema,
  reorderPhotosSchema,
  updateTagsSchema,
} from "@/lib/validations/photo";

type ActionResult = { success: true } | { success: false; error: string };

export async function setFavorite(data: unknown): Promise<ActionResult> {
  const parsed = setFavoriteSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const { photoId, entityType, entityId } = parsed.data;
    await setFavoritePhoto(photoId, entityType, entityId);

    revalidatePath(`/people/${entityId}`);
    revalidatePath(`/projects/${entityId}`);
    revalidatePath("/people");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to set favorite" };
  }
}

export async function reorderPhotos(data: unknown): Promise<ActionResult> {
  const parsed = reorderPhotosSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const { entityType, entityId, orderedIds } = parsed.data;
    await reorderPhotosService(entityType, entityId, orderedIds);

    revalidatePath(`/people/${entityId}`);
    revalidatePath(`/projects/${entityId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to reorder photos" };
  }
}

export async function removePhoto(
  photoId: string,
  entityId: string,
): Promise<ActionResult> {
  try {
    await deletePhoto(photoId);

    revalidatePath(`/people/${entityId}`);
    revalidatePath(`/projects/${entityId}`);
    revalidatePath("/people");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to remove photo" };
  }
}

export async function updatePhotoTags(data: unknown): Promise<ActionResult> {
  const parsed = updateTagsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    await updateTagsService(parsed.data.photoId, parsed.data.tags);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update tags" };
  }
}
