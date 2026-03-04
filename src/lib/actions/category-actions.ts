"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createCategoryGroup,
  updateCategoryGroup,
  deleteCategoryGroup,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategoryGroups,
  reorderCategories,
} from "@/lib/services/category-service";

type ActionResult = { success: boolean; error?: string };

// ─── Group actions ───────────────────────────────────────────────────────────

export async function createCategoryGroupAction(
  name: string,
): Promise<ActionResult> {
  try {
    await createCategoryGroup({ name });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateCategoryGroupAction(
  id: string,
  data: { name?: string; sortOrder?: number },
): Promise<ActionResult> {
  try {
    await updateCategoryGroup(id, data);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteCategoryGroupAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteCategoryGroup(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function reorderCategoryGroupsAction(
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await reorderCategoryGroups(orderedIds);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Category actions ────────────────────────────────────────────────────────

export async function createCategoryAction(
  groupId: string,
  name: string,
  entityModel?: string | null,
): Promise<ActionResult> {
  try {
    await createCategory({ groupId, name, entityModel });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateCategoryAction(
  id: string,
  data: { name?: string; entityModel?: string | null; sortOrder?: number },
): Promise<ActionResult> {
  try {
    await updateCategory(id, data);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteCategoryAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteCategory(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function reorderCategoriesAction(
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await reorderCategories(orderedIds);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Category assignment for person media ────────────────────────────────────

export async function assignCategoryAction(
  personId: string,
  mediaItemId: string,
  categoryId: string,
  sessionId: string,
  opts?: { bodyRegion?: string; notes?: string },
): Promise<ActionResult> {
  try {
    // Check if a DETAIL link with this category already exists
    const existing = await prisma.personMediaLink.findFirst({
      where: { personId, mediaItemId, usage: "DETAIL", categoryId },
    });
    if (!existing) {
      await prisma.personMediaLink.create({
        data: {
          personId,
          mediaItemId,
          usage: "DETAIL",
          categoryId,
          bodyRegion: opts?.bodyRegion ?? null,
          notes: opts?.notes ?? null,
        },
      });
    }
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function removeCategoryAction(
  personId: string,
  mediaItemId: string,
  categoryId: string,
  sessionId: string,
): Promise<ActionResult> {
  try {
    await prisma.personMediaLink.deleteMany({
      where: { personId, mediaItemId, usage: "DETAIL", categoryId },
    });
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
