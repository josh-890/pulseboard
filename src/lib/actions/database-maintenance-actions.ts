"use server";

import { revalidatePath } from "next/cache";
import {
  findAndFixOrphanedMedia,
  findAndFixDuplicateMedia,
  findAndFixDuplicatePersonMediaLinks,
  refreshAllMaterializedViews,
} from "@/lib/services/database-maintenance-service";

type MaintenanceActionResult = {
  success: boolean;
  error?: string;
  found?: number;
  fixed?: number;
  details?: string[];
};

export async function fixOrphanedMediaAction(): Promise<MaintenanceActionResult> {
  try {
    const result = await findAndFixOrphanedMedia();
    revalidatePath("/settings");
    return { success: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function fixDuplicateMediaAction(): Promise<MaintenanceActionResult> {
  try {
    const result = await findAndFixDuplicateMedia();
    revalidatePath("/settings");
    return { success: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function fixDuplicateLinksAction(): Promise<MaintenanceActionResult> {
  try {
    const result = await findAndFixDuplicatePersonMediaLinks();
    revalidatePath("/settings");
    return { success: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function refreshViewsAction(): Promise<MaintenanceActionResult> {
  try {
    const result = await refreshAllMaterializedViews();
    revalidatePath("/");
    return { success: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
