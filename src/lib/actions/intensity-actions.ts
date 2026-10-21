"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import {
  copyContributionIntensity,
  getContributionActSessionId,
  getContributionActsSessionId,
  getContributionsSessionId,
  restoreContributionActs,
  setContributionsAct,
  setContributionsExtras,
  setContributionActExtras,
  setContributionActNote,
  setActEvidence,
  setActsEvidence,
} from "@/lib/services/intensity-service";
import type { SimpleActionResult } from "@/lib/types";

// Intensity on a session (ADR-0036, slice 2): extras per person, acts ticked,
// an act's own extras, photos as evidence (3b). Each action revalidates the session page.

async function run(sessionOf: () => Promise<string>, fn: () => Promise<unknown>): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const sessionId = await sessionOf();
      await fn();
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      console.error("intensity", err);
      return { success: false, error: err instanceof Error ? err.message : "Unexpected error" };
    }
  });
}

export async function setContributionActExtrasAction(contributionActId: string, extraIds: string[]) {
  return run(
    () => getContributionActSessionId(contributionActId),
    () => setContributionActExtras(contributionActId, extraIds),
  );
}

export async function setContributionActNoteAction(contributionActId: string, note: string) {
  return run(
    () => getContributionActSessionId(contributionActId),
    () => setContributionActNote(contributionActId, note),
  );
}

export async function setContributionsExtrasAction(entries: { contributionId: string; extraIds: string[] }[]) {
  return run(
    () => getContributionsSessionId(entries.map((e) => e.contributionId)),
    () => setContributionsExtras(entries),
  );
}

export async function setContributionsActAction(contributionIds: string[], actId: string, ticked: boolean) {
  return run(
    () => getContributionsSessionId(contributionIds),
    () => setContributionsAct(contributionIds, actId, ticked),
  );
}

export async function restoreContributionActsAction(
  items: {
    contributionId: string;
    actId: string;
    notes: string | null;
    overrides: { extraId: string; mode: "ADD" | "DROP" }[];
    mediaIds?: string[];
  }[],
) {
  return run(
    () => getContributionsSessionId([...new Set(items.map((i) => i.contributionId))]),
    () => restoreContributionActs(items),
  );
}

export async function copyContributionIntensityAction(fromId: string, toId: string) {
  return run(
    () => getContributionsSessionId([fromId, toId]),
    () => copyContributionIntensity(fromId, toId),
  );
}

export async function setActsEvidenceAction(contributionActIds: string[], mediaItemIds: string[], linked: boolean) {
  return run(
    () => getContributionActsSessionId(contributionActIds),
    () => setActsEvidence(contributionActIds, mediaItemIds, linked),
  );
}

export async function setActEvidenceAction(contributionActId: string, mediaItemIds: string[]) {
  return run(
    () => getContributionActSessionId(contributionActId),
    () => setActEvidence(contributionActId, mediaItemIds),
  );
}
