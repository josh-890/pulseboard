"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  updateIntensityScaleStep,
  createIntensityScenario,
  renameIntensityScenario,
  deleteIntensityScenario,
  moveIntensityScenario,
  createIntensityAct,
  updateIntensityAct,
  deleteIntensityAct,
  getIntensityActUsage,
  setIntensityMax,
  moveIntensityActs,
  createIntensityExtraGroup,
  renameIntensityExtraGroup,
  deleteIntensityExtraGroup,
  createIntensityExtra,
  updateIntensityExtra,
  deleteIntensityExtra,
} from "@/lib/services/intensity-catalog-service";
import type { IntensityActPlace } from "@/lib/services/intensity-catalog-service";
import type { SimpleActionResult } from "@/lib/types";

// The intensity catalog editor (ADR-0036). Every action revalidates the
// settings page; people and sessions read the catalog fresh on render.

async function run(fn: () => Promise<unknown>): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await fn();
      revalidatePath("/settings/catalogs/intensity");
      return { success: true };
    } catch (err) {
      console.error("intensity catalog", err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message.includes("Unique constraint") ? "That name is already taken." : message };
    }
  });
}

export async function updateIntensityScaleStepAction(value: number, data: { title?: string; description?: string }) {
  return run(() => updateIntensityScaleStep(value, data));
}

export async function createIntensityScenarioAction(name: string) {
  return run(() => createIntensityScenario(name));
}
export async function renameIntensityScenarioAction(id: string, name: string) {
  return run(() => renameIntensityScenario(id, name));
}
export async function deleteIntensityScenarioAction(id: string) {
  return run(() => deleteIntensityScenario(id));
}
export async function moveIntensityScenarioAction(id: string, direction: -1 | 1) {
  return run(() => moveIntensityScenario(id, direction));
}

export async function createIntensityActAction(scenarioId: string, name: string, level: number) {
  return run(() => createIntensityAct(scenarioId, name, level));
}
export async function updateIntensityActAction(
  id: string,
  data: { name?: string; description?: string | null; level?: number },
) {
  return run(() => updateIntensityAct(id, data));
}
/** The top of the scale (2026-10-23); people and sessions re-rate on their next render */
export async function setIntensityMaxAction(max: number) {
  return run(() => setIntensityMax(max));
}

/** Where an act is ticked — read when its panel opens */
export async function getIntensityActUsageAction(actId: string) {
  return withTenantFromHeaders(() => getIntensityActUsage(actId));
}
/** Drag on the board: acts into a cell (scenario × level), before an act or at the end */
export async function moveIntensityActsAction(ids: string[], to: IntensityActPlace) {
  return run(() => moveIntensityActs(ids, to));
}
export async function deleteIntensityActAction(id: string) {
  return run(() => deleteIntensityAct(id));
}

export async function createIntensityExtraGroupAction(name: string) {
  return run(() => createIntensityExtraGroup(name));
}
export async function renameIntensityExtraGroupAction(id: string, name: string) {
  return run(() => renameIntensityExtraGroup(id, name));
}
export async function deleteIntensityExtraGroupAction(id: string) {
  return run(() => deleteIntensityExtraGroup(id));
}

export async function createIntensityExtraAction(name: string, points: number, groupId: string | null) {
  return run(() => createIntensityExtra(name, points, groupId));
}
export async function updateIntensityExtraAction(
  id: string,
  data: { name?: string; points?: number; groupId?: string | null },
) {
  return run(() => updateIntensityExtra(id, data));
}
export async function deleteIntensityExtraAction(id: string) {
  return run(() => deleteIntensityExtra(id));
}
