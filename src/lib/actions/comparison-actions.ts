"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  createComparison,
  deleteComparison,
  addComparisonItems,
  removeComparisonItem,
  reorderComparisonItems,
  reorderComparisons,
  setComparisonAspectDriver,
  setComparisonFitMode,
  setComparisonItemFocal,
  type ComparisonFitMode,
} from "@/lib/services/comparison-service";
import type { SimpleActionResult } from "@/lib/types";

type ActionResultWithId = SimpleActionResult & { id?: string };

function revalidateCollection(collectionId: string) {
  revalidatePath("/collections");
  revalidatePath(`/collections/${collectionId}`);
}

export async function createComparisonAction(
  collectionId: string,
  mediaItemIds: string[],
): Promise<ActionResultWithId> {
  return withTenantFromHeaders(async () => {
    try {
      const id = await createComparison(collectionId, mediaItemIds);
      revalidateCollection(collectionId);
      return { success: true, id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create comparison" };
    }
  });
}

export async function deleteComparisonAction(comparisonId: string, collectionId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteComparison(comparisonId);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to delete comparison" };
    }
  });
}

export async function addComparisonItemsAction(
  comparisonId: string,
  mediaItemIds: string[],
  collectionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addComparisonItems(comparisonId, mediaItemIds);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to add items" };
    }
  });
}

export async function removeComparisonItemAction(
  comparisonId: string,
  mediaItemId: string,
  collectionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeComparisonItem(comparisonId, mediaItemId);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to remove item" };
    }
  });
}

export async function reorderComparisonItemsAction(
  comparisonId: string,
  orderedMediaItemIds: string[],
  collectionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderComparisonItems(comparisonId, orderedMediaItemIds);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to reorder" };
    }
  });
}

export async function reorderComparisonsAction(
  collectionId: string,
  orderedIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reorderComparisons(collectionId, orderedIds);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to reorder" };
    }
  });
}

export async function setComparisonAspectDriverAction(
  comparisonId: string,
  mediaItemId: string | null,
  collectionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setComparisonAspectDriver(comparisonId, mediaItemId);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to set aspect driver" };
    }
  });
}

export async function setComparisonFitModeAction(
  comparisonId: string,
  fitMode: ComparisonFitMode,
  collectionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setComparisonFitMode(comparisonId, fitMode);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to set fit mode" };
    }
  });
}

export async function setComparisonItemFocalAction(
  comparisonId: string,
  mediaItemId: string,
  focalX: number | null,
  focalY: number | null,
  collectionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setComparisonItemFocal(comparisonId, mediaItemId, focalX, focalY);
      revalidateCollection(collectionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to set focal point" };
    }
  });
}
