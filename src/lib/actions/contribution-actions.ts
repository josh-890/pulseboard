"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import type { ParticipationConfidence } from "@/generated/prisma/client";
import {
  addSessionContribution,
  removeSessionContribution,
  updateSessionContribution,
  updateSessionContributionConfidence,
} from "@/lib/services/contribution-service";
import { getPersonEras } from "@/lib/services/era-service";
import type { SimpleActionResult } from "@/lib/types";

/**
 * Era list for the contribution Era picker (ADR-0004). Returns the person's
 * eras shaped for the dropdown: baseline first, then chronologically.
 */
export async function getPersonErasForPickerAction(
  personId: string,
): Promise<{ id: string; label: string; date: Date | null; isBaseline: boolean }[]> {
  return withTenantFromHeaders(async () => {
    const eras = await getPersonEras(personId);
    return eras;
  });
}

export async function addSessionContributionAction(
  sessionId: string,
  personId: string,
  roleDefinitionId: string,
  opts?: {
    creditNameOverride?: string;
    notes?: string;
    confidence?: ParticipationConfidence;
    confidenceSource?: "MANUAL" | "CREDIT_MATCH" | "IMPORT";
    eraId?: string | null;
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
  data: { creditNameOverride?: string | null; notes?: string | null; eraId?: string | null },
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
