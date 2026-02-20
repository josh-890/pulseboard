"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createPersonSchema, updatePersonSchema } from "@/lib/validations/person";
import {
  createPersonRecord,
  updatePersonRecord,
  deletePersonRecord,
  getPersonsPaginated,
} from "@/lib/services/person-service";
import type { PersonFilters } from "@/lib/services/person-service";
import { getFavoritePhotosForPersons } from "@/lib/services/photo-service";
import { prisma } from "@/lib/db";

type ActionResult =
  | { success: true; id: string }
  | { success: false; error: { fieldErrors?: Record<string, string[]> } | string };

type DeleteResult = { success: boolean; error?: string };

export async function createPerson(raw: unknown): Promise<ActionResult> {
  const parsed = createPersonSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    const person = await createPersonRecord(parsed.data);
    revalidatePath("/people");
    return { success: true, id: person.id };
  } catch (err) {
    if (err instanceof Error && err.message.includes("P2002")) {
      return {
        success: false,
        error: { fieldErrors: { icgId: ["ICG-ID already exists"] } },
      };
    }
    return { success: false, error: "Unexpected error" };
  }
}

export async function updatePerson(raw: unknown): Promise<ActionResult> {
  const parsed = updatePersonSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.flatten() };
  }

  try {
    await updatePersonRecord(parsed.data.id, parsed.data);
    revalidatePath("/people");
    revalidatePath(`/people/${parsed.data.id}`);
    return { success: true, id: parsed.data.id };
  } catch {
    return { success: false, error: "Unexpected error" };
  }
}

export async function deletePerson(id: string): Promise<DeleteResult> {
  try {
    await deletePersonRecord(id);
    revalidatePath("/people");
    return { success: true };
  } catch {
    return { success: false, error: "Failed to delete person" };
  }
}

const createMinimalPersonSchema = z.object({
  icgId: z
    .string()
    .min(1, "ICG-ID is required")
    .regex(/^[A-Z]{2}-[0-9]{2}[A-Z0-9@][A-Z0-9]+$/, "Format: XX-00XXX  e.g. JD-96ABF"),
  commonName: z.string().min(1, "Display name is required"),
});

export async function createMinimalPerson(
  raw: unknown,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = createMinimalPersonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation error",
    };
  }

  try {
    const person = await prisma.$transaction(async (tx) => {
      const p = await tx.person.create({
        data: { icgId: parsed.data.icgId, status: "active" },
      });
      await tx.personAlias.create({
        data: { personId: p.id, name: parsed.data.commonName, type: "common" },
      });
      await tx.persona.create({
        data: { personId: p.id, label: "Baseline", isBaseline: true, date: new Date() },
      });
      return p;
    });

    revalidatePath("/people");
    return { success: true, id: person.id };
  } catch (err) {
    if (err instanceof Error && err.message.includes("P2002")) {
      return { success: false, error: "ICG-ID already exists" };
    }
    return { success: false, error: "Unexpected error" };
  }
}

export async function loadMorePersons(
  filters: PersonFilters,
  cursor: string,
) {
  const result = await getPersonsPaginated(filters, cursor, 50);
  const photoMapRaw = await getFavoritePhotosForPersons(
    result.items.map((p) => p.id),
  );
  const photoMap = Object.fromEntries(photoMapRaw);
  return {
    items: result.items,
    nextCursor: result.nextCursor,
    photoMap,
  };
}