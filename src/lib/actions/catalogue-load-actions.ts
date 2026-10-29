"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenantId, withTenantFromHeaders } from "@/lib/tenant-context";
import { requestCatalogueMatch } from "@/lib/services/catalogue-match-service";
import { requestPersonHints } from "@/lib/services/catalogue-develop-service";
import { retryCoverRequests } from "@/lib/services/catalogue-cover-service";
import {
  CatalogueLoadRefused,
  previewUndo,
  undoRun,
  type UndoPreview,
} from "@/lib/services/catalogue-load-service";

type UndoResult = { success: true; preview: UndoPreview } | { success: false; error: string };

/** What Undo of this run would remove, keep and restore — shown before it happens */
export async function previewUndoAction(runId: string): Promise<UndoResult> {
  return withTenantFromHeaders(async () => {
    try {
      return { success: true, preview: await previewUndo(runId) };
    } catch (err) {
      if (err instanceof CatalogueLoadRefused) return { success: false, error: err.message };
      console.error("[previewUndoAction]", err);
      return { success: false, error: "Could not work out what Undo would do" };
    }
  });
}

export async function undoRunAction(runId: string): Promise<UndoResult> {
  return withTenantFromHeaders(async () => {
    try {
      const preview = await undoRun(runId);
      // The sets it took back may have been what archive folders matched
      requestCatalogueMatch(getCurrentTenantId(), { kind: "all" });
      requestPersonHints(getCurrentTenantId());
      revalidatePath("/people/contacts/runs");
      revalidatePath("/people/contacts");
      return { success: true, preview };
    } catch (err) {
      if (err instanceof CatalogueLoadRefused) return { success: false, error: err.message };
      console.error("[undoRunAction]", err);
      return { success: false, error: "Undo failed — nothing was changed" };
    }
  });
}

/** Match every unsettled archive folder against the catalogue now, in the background */
export async function matchArchiveNowAction(): Promise<{ success: true }> {
  return withTenantFromHeaders(async () => {
    requestCatalogueMatch(getCurrentTenantId(), { kind: "all" });
    revalidatePath("/people/contacts/runs");
    return { success: true };
  });
}

/** Weigh every developed Person's catalogue file whose hint is not worked out yet, in the background */
export async function checkPersonFilesAction(): Promise<{ success: true }> {
  return withTenantFromHeaders(async () => {
    requestPersonHints(getCurrentTenantId());
    revalidatePath("/people/contacts/runs");
    return { success: true };
  });
}

/** Ask the catalogue again for covers it did not have or that were damaged */
export async function retryCoversAction(): Promise<{ success: true; count: number }> {
  return withTenantFromHeaders(async () => {
    const count = await retryCoverRequests();
    revalidatePath("/people/contacts/runs");
    return { success: true, count };
  });
}
