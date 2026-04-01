"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import type { SkillLevel, ParticipationConfidence } from "@/generated/prisma/client";
import {
  addSessionContribution,
  removeSessionContribution,
  updateSessionContribution,
  updateSessionContributionConfidence,
  addContributionSkill,
  removeContributionSkill,
  updateContributionSkillLevel,
  addMediaToContributionSkill,
  removeMediaFromContributionSkill,
} from "@/lib/services/contribution-service";
import type { SimpleActionResult } from "@/lib/types";

export async function addSessionContributionAction(
  sessionId: string,
  personId: string,
  roleDefinitionId: string,
  opts?: {
    creditNameOverride?: string;
    notes?: string;
    confidence?: ParticipationConfidence;
    confidenceSource?: "MANUAL" | "CREDIT_MATCH" | "IMPORT";
  },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addSessionContribution(sessionId, personId, roleDefinitionId, opts);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function removeSessionContributionAction(
  contributionId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeSessionContribution(contributionId);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateSessionContributionAction(
  contributionId: string,
  sessionId: string,
  data: { creditNameOverride?: string | null; notes?: string | null },
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateSessionContribution(contributionId, data);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function addContributionSkillAction(
  contributionId: string,
  skillDefinitionId: string,
  sessionId: string,
  level?: SkillLevel | null,
  notes?: string | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addContributionSkill(contributionId, skillDefinitionId, level, notes);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function removeContributionSkillAction(
  contributionSkillId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeContributionSkill(contributionSkillId);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateContributionSkillLevelAction(
  contributionSkillId: string,
  sessionId: string,
  level: SkillLevel | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateContributionSkillLevel(contributionSkillId, level);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function addMediaToContributionSkillAction(
  contributionSkillId: string,
  mediaItemIds: string[],
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addMediaToContributionSkill(contributionSkillId, mediaItemIds);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function removeMediaFromContributionSkillAction(
  contributionSkillId: string,
  mediaItemId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeMediaFromContributionSkill(contributionSkillId, mediaItemId);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function updateContributionConfidenceAction(
  contributionId: string,
  sessionId: string,
  confidence: ParticipationConfidence,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateSessionContributionConfidence(contributionId, confidence);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}
