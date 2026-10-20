"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  createDisclosureSituation,
  updateDisclosureSituation,
  deleteDisclosureSituation,
  moveDisclosureSituation,
  createDisclosureLevel,
  updateDisclosureLevel,
  deleteDisclosureLevel,
  moveDisclosureLevel,
  createDisclosureSetting,
  updateDisclosureSetting,
  deleteDisclosureSetting,
  moveDisclosureSetting,
} from "@/lib/services/disclosure-catalog-service";
import type { SimpleActionResult } from "@/lib/types";

// The disclosure matrix editor (ADR-0035). Every action revalidates the
// settings page; people and sessions read the matrix fresh on render.

async function run(fn: () => Promise<unknown>): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await fn();
      revalidatePath("/settings/catalogs/disclosure");
      return { success: true };
    } catch (err) {
      console.error("disclosure catalog", err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message.includes("Unique constraint") ? "That name is already taken." : message };
    }
  });
}

export async function createDisclosureSituationAction(name: string) {
  return run(() => createDisclosureSituation(name));
}
export async function updateDisclosureSituationAction(id: string, data: { name?: string; weight?: number }) {
  return run(() => updateDisclosureSituation(id, data));
}
export async function deleteDisclosureSituationAction(id: string) {
  return run(() => deleteDisclosureSituation(id));
}
export async function moveDisclosureSituationAction(id: string, direction: -1 | 1) {
  return run(() => moveDisclosureSituation(id, direction));
}

export async function createDisclosureLevelAction(situationId: string, name: string, description?: string | null) {
  return run(() => createDisclosureLevel(situationId, name, description));
}
export async function updateDisclosureLevelAction(id: string, data: { name?: string; description?: string | null }) {
  return run(() => updateDisclosureLevel(id, data));
}
export async function deleteDisclosureLevelAction(id: string) {
  return run(() => deleteDisclosureLevel(id));
}
export async function moveDisclosureLevelAction(id: string, direction: -1 | 1) {
  return run(() => moveDisclosureLevel(id, direction));
}

export async function createDisclosureSettingAction(name: string) {
  return run(() => createDisclosureSetting(name));
}
export async function updateDisclosureSettingAction(id: string, name: string) {
  return run(() => updateDisclosureSetting(id, name));
}
export async function deleteDisclosureSettingAction(id: string) {
  return run(() => deleteDisclosureSetting(id));
}
export async function moveDisclosureSettingAction(id: string, direction: -1 | 1) {
  return run(() => moveDisclosureSetting(id, direction));
}
