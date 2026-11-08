"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { clearBrandLogo, setBrandLogo, setBrandStyle, type BrandKind } from "@/lib/services/brand-service";
import type { SimpleActionResult } from "@/lib/types";

const KINDS: BrandKind[] = ["channel", "label", "artist"];

function revalidateBrand(kind: BrandKind, id: string) {
  // The mark shows on many pages (lists, set heroes, careers) — refresh them all
  revalidatePath(`/${kind}s/${id}`);
  revalidatePath("/", "layout");
}

export async function setBrandLogoAction(kind: BrandKind, id: string, form: FormData): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (!KINDS.includes(kind)) return { success: false, error: "Unknown kind" };
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { success: false, error: "No image chosen" };
    try {
      await setBrandLogo(kind, id, Buffer.from(await file.arrayBuffer()));
      revalidateBrand(kind, id);
      return { success: true };
    } catch (err) {
      console.error("[setBrandLogoAction]", err);
      const reason = err instanceof Error ? err.message : "unknown error";
      return { success: false, error: `This image could not be read: ${reason}` };
    }
  });
}

export async function clearBrandLogoAction(kind: BrandKind, id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (!KINDS.includes(kind)) return { success: false, error: "Unknown kind" };
    try {
      await clearBrandLogo(kind, id);
      revalidateBrand(kind, id);
      return { success: true };
    } catch (err) {
      console.error("[clearBrandLogoAction]", err);
      return { success: false, error: "Could not remove the logo" };
    }
  });
}

export async function setBrandStyleAction(
  kind: BrandKind,
  id: string,
  style: { markFont: string | null; markColor: string | null },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (!KINDS.includes(kind)) return { success: false, error: "Unknown kind" };
    try {
      await setBrandStyle(kind, id, style);
      revalidateBrand(kind, id);
      return { success: true };
    } catch (err) {
      console.error("[setBrandStyleAction]", err);
      return { success: false, error: err instanceof Error ? err.message : "Could not save the look" };
    }
  });
}
