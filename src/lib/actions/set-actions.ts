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
} from "@/lib/services/set-service";
import type { SetFilters } from "@/lib/services/set-service";
import { getFavoritePhotosForSets } from "@/lib/services/photo-service";
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
    revalidatePath("/sets");
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
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete set" };
  }
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
