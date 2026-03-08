"use server";

import { revalidatePath } from "next/cache";
import type { SkillLevel, SkillEventType } from "@/generated/prisma/client";
import {
  createPersonSkill,
  updatePersonSkill,
  deletePersonSkill,
  createSkillEvent,
  deleteSkillEvent,
  addSessionParticipantSkill,
  removeSessionParticipantSkill,
  updateSessionParticipantSkillLevel,
  addMediaToSessionSkill,
  removeMediaFromSessionSkill,
  addMediaToSkillEvent,
  removeMediaFromSkillEvent,
} from "@/lib/services/skill-service";

type ActionResult = { success: boolean; error?: string };

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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await deleteSkillEvent(id);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

// ─── Session Participant Skill ───────────────────────────────────────────────

export async function addSessionParticipantSkillAction(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
  level?: SkillLevel | null,
  notes?: string | null,
): Promise<ActionResult & { demonstratedEventId?: string | null }> {
  try {
    const { demonstratedEventId } = await addSessionParticipantSkill(
      sessionId,
      personId,
      skillDefinitionId,
      level,
      notes,
    );
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true, demonstratedEventId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function removeSessionParticipantSkillAction(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
): Promise<ActionResult> {
  try {
    await removeSessionParticipantSkill(sessionId, personId, skillDefinitionId);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function updateSessionSkillLevelAction(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
  level: SkillLevel | null,
): Promise<ActionResult> {
  try {
    await updateSessionParticipantSkillLevel(sessionId, personId, skillDefinitionId, level);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function addMediaToSessionSkillAction(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
  mediaItemIds: string[],
): Promise<ActionResult> {
  try {
    await addMediaToSessionSkill(sessionId, personId, skillDefinitionId, mediaItemIds);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function removeMediaFromSessionSkillAction(
  sessionId: string,
  personId: string,
  skillDefinitionId: string,
  mediaItemId: string,
): Promise<ActionResult> {
  try {
    await removeMediaFromSessionSkill(sessionId, personId, skillDefinitionId, mediaItemId);
    revalidatePath(`/sessions/${sessionId}`);
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
): Promise<ActionResult> {
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
): Promise<ActionResult> {
  try {
    await removeMediaFromSkillEvent(skillEventId, mediaItemId);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
