"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withTenantFromHeaders } from "@/lib/tenant-context";
import {
  createScrapeSource,
  updateScrapeSource,
  deleteScrapeSource,
} from "@/lib/services/scrape-source-service";
import { setScanCadenceDays } from "@/lib/services/scan-service";
import type { SimpleActionResult } from "@/lib/types";

const sourceSchema = z.object({
  key: z.string().min(1, "Key is required").max(40),
  displayName: z.string().min(1, "Name is required").max(60),
  domains: z.array(z.string()).default([]),
  isScannable: z.boolean(),
  fileName: z.string().max(60).default(""),
  lineFormat: z.enum(["URL_ONLY", "ICGID_URL"]),
  urlPattern: z.string().max(200).nullish(),
  sortOrder: z.number().int().optional(),
});

function revalidate() {
  revalidatePath("/settings/scanning");
  revalidatePath("/watchlist");
}

export async function createScrapeSourceAction(
  data: unknown,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = sourceSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    try {
      await createScrapeSource(parsed.data);
      revalidate();
      return { success: true };
    } catch {
      return { success: false, error: "Failed to create source (key must be unique)" };
    }
  });
}

export async function updateScrapeSourceAction(
  id: string,
  data: unknown,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = sourceSchema.partial().safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    try {
      await updateScrapeSource(id, parsed.data);
      revalidate();
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update source" };
    }
  });
}

export async function deleteScrapeSourceAction(
  id: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteScrapeSource(id);
      revalidate();
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete source" };
    }
  });
}

const cadenceSchema = z.object({
  priority: z.enum(["HIGH", "NORMAL", "LOW"]),
  days: z.number().int().min(1).max(3650),
});

export async function updateScanCadenceAction(
  data: unknown,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = cadenceSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }
    try {
      await setScanCadenceDays(parsed.data.priority, parsed.data.days);
      revalidate();
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update cadence" };
    }
  });
}
