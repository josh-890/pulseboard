"use server";

import { revalidatePath } from "next/cache";
import type { SkillLevel, SkillEventType } from "@/generated/prisma/client";
import {
  createPersonSkill,
  updatePersonSkill,
  deletePersonSkill,
  createSkillEvent,
  deleteSkillEvent,
  addMediaToSkillEvent,
  removeMediaFromSkillEvent,
} from "@/lib/services/skill-service";
import type { SimpleActionResult } from "@/lib/types";

// ─── Person Skill CRUD ───────────────────────────────────────────────────────

export async function createPersonSkillAction(
  personId: string,
  data: {
    skillDefinitionId?: string | null;
    name?: string;
    category?: string | null;
    level?: SkillLevel | null;
    evidence?: string | null;
    personaId?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
  },
): Promise<SimpleActionResult> {
  try {
    await createPersonSkill({
      personId,
      skillDefinitionId: data.skillDefinitionId,
      name: data.name,
      category: data.category,
      level: data.level,
      evidence: data.evidence,
      personaId: data.personaId,
      validFrom: data.validFrom ? new Date(data.validFrom) : null,
      validTo: data.validTo ? new Date(data.validTo) : null,
    });
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updatePersonSkillAction(
  id: string,
  personId: string,
  data: {
    level?: SkillLevel | null;
    evidence?: string | null;
    personaId?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
  },
): Promise<SimpleActionResult> {
  try {
    await updatePersonSkill(id, {
      level: data.level,
      evidence: data.evidence,
      personaId: data.personaId,
      validFrom: data.validFrom ? new Date(data.validFrom) : null,
      validTo: data.validTo ? new Date(data.validTo) : null,
    });
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deletePersonSkillAction(
  id: string,
  personId: string,
): Promise<SimpleActionResult> {
  try {
    await deletePersonSkill(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Skill Event CRUD ────────────────────────────────────────────────────────

export async function createSkillEventAction(
  personId: string,
  data: {
    personSkillId: string;
    personaId?: string | null;
    eventType: SkillEventType;
    level?: SkillLevel | null;
    notes?: string | null;
    date?: string | null;
    datePrecision?: string;
  },
): Promise<SimpleActionResult> {
  try {
    await createSkillEvent({
      ...data,
      date: data.date ? new Date(data.date) : null,
    });
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function deleteSkillEventAction(
  id: string,
  personId: string,
): Promise<SimpleActionResult> {
  try {
    await deleteSkillEvent(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Skill Event Media ──────────────────────────────────────────────────────

export async function addMediaToSkillEventAction(
  skillEventId: string,
  mediaItemIds: string[],
  personId: string,
): Promise<SimpleActionResult> {
  try {
    await addMediaToSkillEvent(skillEventId, mediaItemIds);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function removeMediaFromSkillEventAction(
  skillEventId: string,
  mediaItemId: string,
  personId: string,
): Promise<SimpleActionResult> {
  try {
    await removeMediaFromSkillEvent(skillEventId, mediaItemId);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
