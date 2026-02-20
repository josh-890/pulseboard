"use server";

import { revalidatePath } from "next/cache";
import {
  createSetSchema,
  updateSetSchema,
  createSetWithContextSchema,
  createSetForSessionSchema,
  contributionItemSchema,
} from "@/lib/validations/set";
import {
  createSetRecord,
  updateSetRecord,
  deleteSetRecord,
  createSetWithContextRecord,
  createSetForSessionRecord,
  addContributions,
  searchPersonsForSelect,
  getSetsPaginated,
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

type SaveContributionsResult = { success: boolean; error?: string };

export async function createSet(raw: unknown): Promise<ActionResult> {
  const parsed = createSetSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    const set = await createSetRecord(parsed.data);
    revalidatePath("/sets");
    return { success: true, id: set.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function createSetWithContext(raw: unknown): Promise<SetIdResult> {
  const parsed = createSetWithContextSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }

  try {
    const result = await createSetWithContextRecord(parsed.data);
    revalidatePath("/sets");
    revalidatePath("/projects");
    return { success: true, setId: result.setId };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function createSetForSession(raw: unknown): Promise<SetIdResult> {
  const parsed = createSetForSessionSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
  }

  try {
    const result = await createSetForSessionRecord(parsed.data);
    revalidatePath("/sets");
    revalidatePath("/projects");
    revalidatePath(`/projects/${parsed.data.projectId}`);
    return { success: true, setId: result.setId };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function saveContributions(
  setId: string,
  rawContributions: unknown[],
): Promise<SaveContributionsResult> {
  const parsed = z.array(contributionItemSchema).safeParse(rawContributions);
  if (!parsed.success) {
    return { success: false, error: "Invalid contributions data" };
  }

  try {
    await addContributions(setId, parsed.data);
    revalidatePath(`/sets/${setId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save contributors" };
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