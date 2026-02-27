"use server";

import { revalidatePath } from "next/cache";
import {
  updateSetSchema,
  createSetStandaloneSchema,
  creditEntrySchema,
  labelEvidenceEntrySchema,
} from "@/lib/validations/set";
import {
  updateSetRecord,
  deleteSetRecord,
  createSetStandaloneRecord,
  searchPersonsForSelect,
  getSetsPaginated,
  createSetCreditsRaw,
  createSetLabelEvidence,
  resolveCreditRaw,
  ignoreCreditRaw,
  unresolveCreditRaw,
  getRecentChannels,
  getLastUsedSetType,
  createManualLabelEvidence,
  deleteLabelEvidence,
  getSuggestedResolutions,
} from "@/lib/services/set-service";
import type { SetFilters } from "@/lib/services/set-service";
import { getFavoritePhotosForSets } from "@/lib/services/photo-service";
import { getLabels } from "@/lib/services/label-service";
import { prisma } from "@/lib/db";
import { z } from "zod";

type ActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

type SetIdResult =
  | { success: true; setId: string }
  | { success: false; error: string };

type DeleteResult = { success: boolean; error?: string };

type SimpleResult = { success: boolean; error?: string };

export async function createSetStandalone(raw: unknown): Promise<SetIdResult> {
  const parsed = createSetStandaloneSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }

  try {
    const result = await createSetStandaloneRecord(parsed.data);

    // Log session creation activity
    await prisma.activity.create({
      data: {
        title: `Session "${parsed.data.title}" auto-created`,
        time: new Date(),
        type: "session_added",
      },
    });

    revalidatePath("/sets");
    revalidatePath("/sessions");
    revalidatePath("/");
    return { success: true, setId: result.setId };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function saveSetCredits(
  setId: string,
  rawCredits: unknown[],
): Promise<SimpleResult> {
  const parsed = z.array(creditEntrySchema).safeParse(rawCredits);
  if (!parsed.success) {
    return { success: false, error: "Invalid credits data" };
  }

  try {
    await createSetCreditsRaw(setId, parsed.data);
    revalidatePath(`/sets/${setId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save credits" };
  }
}

export async function saveSetLabelEvidence(
  setId: string,
  rawEvidence: unknown[],
): Promise<SimpleResult> {
  const parsed = z.array(labelEvidenceEntrySchema).safeParse(rawEvidence);
  if (!parsed.success) {
    return { success: false, error: "Invalid evidence data" };
  }

  try {
    await createSetLabelEvidence(setId, parsed.data);
    revalidatePath(`/sets/${setId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save label evidence" };
  }
}

export async function resolveCredit(
  creditId: string,
  personId: string,
): Promise<SimpleResult> {
  try {
    await resolveCreditRaw(creditId, personId);
    revalidatePath("/sets");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to resolve credit" };
  }
}

export async function ignoreCredit(creditId: string): Promise<SimpleResult> {
  try {
    await ignoreCreditRaw(creditId);
    revalidatePath("/sets");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to ignore credit" };
  }
}

export async function unresolveCredit(creditId: string): Promise<SimpleResult> {
  try {
    await unresolveCreditRaw(creditId);
    revalidatePath("/sets");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to unresolve credit" };
  }
}

export async function searchPersonsAction(q: string) {
  if (!q.trim()) return [];
  return searchPersonsForSelect(q.trim());
}

export async function updateSet(raw: unknown): Promise<ActionResult> {
  const parsed = updateSetSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    await updateSetRecord(parsed.data.id, parsed.data);
    revalidatePath("/sets");
    revalidatePath(`/sets/${parsed.data.id}`);
    return { success: true, id: parsed.data.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function deleteSet(id: string): Promise<DeleteResult> {
  try {
    await deleteSetRecord(id);
    revalidatePath("/sets");
    revalidatePath("/sessions");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete set" };
  }
}

const INLINE_EDITABLE_FIELDS = new Set(["title", "description", "notes"]);

export async function updateSetField(
  id: string,
  field: string,
  value: string,
): Promise<SimpleResult> {
  if (!INLINE_EDITABLE_FIELDS.has(field)) {
    return { success: false, error: `Field "${field}" is not inline-editable` };
  }

  if (field === "title" && !value.trim()) {
    return { success: false, error: "Title cannot be empty" };
  }

  try {
    await updateSetRecord(id, { [field]: value || null });
    revalidatePath(`/sets/${id}`);
    revalidatePath("/sets");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to update field" };
  }
}

export async function getSuggestionsAction(rawName: string, channelId: string | null) {
  return getSuggestedResolutions(rawName, channelId);
}

export async function searchLabelsAction(q: string) {
  if (!q.trim()) return [];
  const labels = await getLabels(q.trim());
  return labels.slice(0, 20).map((l) => ({ id: l.id, name: l.name }));
}

export async function addManualLabelEvidence(
  setId: string,
  labelId: string,
): Promise<SimpleResult> {
  try {
    await createManualLabelEvidence(setId, labelId);
    revalidatePath(`/sets/${setId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to add label evidence" };
  }
}

export async function removeLabelEvidence(
  setId: string,
  labelId: string,
  evidenceType: string,
): Promise<SimpleResult> {
  if (evidenceType !== "CHANNEL_MAP" && evidenceType !== "MANUAL") {
    return { success: false, error: "Invalid evidence type" };
  }
  try {
    await deleteLabelEvidence(setId, labelId, evidenceType);
    revalidatePath(`/sets/${setId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to remove label evidence" };
  }
}

export async function getRecentDefaults() {
  const [recentChannelIds, lastType] = await Promise.all([
    getRecentChannels(5),
    getLastUsedSetType(),
  ]);
  return { recentChannelIds, lastType };
}

export async function loadMoreSets(
  filters: SetFilters,
  cursor: string,
) {
  const result = await getSetsPaginated(filters, cursor, 50);
  const photoMapRaw = await getFavoritePhotosForSets(
    result.items.map((s) => s.id),
  );
  const photoMap = Object.fromEntries(photoMapRaw);
  return {
    items: result.items,
    nextCursor: result.nextCursor,
    photoMap,
  };
}
