"use server";

import { revalidatePath } from "next/cache";
import type { SkillLevel } from "@/generated/prisma/client";
import {
  createSkillGroup,
  updateSkillGroup,
  deleteSkillGroup,
  createSkillDefinition,
  updateSkillDefinition,
  deleteSkillDefinition,
} from "@/lib/services/skill-catalog-service";

type ActionResult = { success: boolean; error?: string };

// ─── Group actions ───────────────────────────────────────────────────────────

export async function createSkillGroupAction(
  name: string,
): Promise<ActionResult> {
  try {
    await createSkillGroup({ name });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateSkillGroupAction(
  id: string,
  data: { name?: string; sortOrder?: number },
): Promise<ActionResult> {
  try {
    await updateSkillGroup(id, data);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteSkillGroupAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteSkillGroup(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Definition actions ──────────────────────────────────────────────────────

export async function createSkillDefinitionAction(
  groupId: string,
  name: string,
  description?: string | null,
  pgrade?: number,
  defaultLevel?: SkillLevel | null,
): Promise<ActionResult> {
  try {
    await createSkillDefinition({ groupId, name, description, pgrade, defaultLevel });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateSkillDefinitionAction(
  id: string,
  data: { name?: string; description?: string | null; pgrade?: number; defaultLevel?: SkillLevel | null; sortOrder?: number },
): Promise<ActionResult> {
  try {
    await updateSkillDefinition(id, data);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteSkillDefinitionAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteSkillDefinition(id);
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
