"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { createPersonSchema, updatePersonSchema } from "@/lib/validations/person";
import {
  createPersonRecord,
  updatePersonRecord,
  deletePersonRecord,
  getPersonsPaginated,
} from "@/lib/services/person-service";
import type { PersonFilters } from "@/lib/services/person-service";
import { getHeadshotsForPersons } from "@/lib/services/media-service";
import { prisma } from "@/lib/db";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createPerson(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function updatePerson(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updatePersonSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      const birthdateChanged =
        parsed.data.birthdate !== undefined || parsed.data.birthdatePrecision !== undefined;

      await updatePersonRecord(parsed.data.id, parsed.data);
      revalidatePath("/people");
      revalidatePath(`/people/${parsed.data.id}`);

      // Birthdate changes affect computed ages on all linked sessions and sets
      if (birthdateChanged) {
        const [sessionLinks, setLinks] = await Promise.all([
          prisma.sessionContribution.findMany({
            where: { personId: parsed.data.id },
            select: { sessionId: true },
          }),
          prisma.setParticipant.findMany({
            where: { personId: parsed.data.id },
            select: { setId: true },
          }),
        ]);
        const sessionIds = [...new Set(sessionLinks.map((l) => l.sessionId))];
        const setIds = [...new Set(setLinks.map((l) => l.setId))];
        if (sessionIds.length > 0) revalidatePath("/sessions");
        if (setIds.length > 0) revalidatePath("/sets");
        for (const sessionId of sessionIds) {
          revalidatePath(`/sessions/${sessionId}`);
        }
        for (const setId of setIds) {
          revalidatePath(`/sets/${setId}`);
        }
      }

      return { success: true, id: parsed.data.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }

  });
}

export async function deletePerson(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const variantsList = await deletePersonRecord(id);

      // Best-effort MinIO cleanup after transaction commits
      if (variantsList.length > 0) {
        try {
          const { deleteMediaFiles } = await import("@/lib/media-upload");
          await deleteMediaFiles(variantsList);
        } catch (err) {
          console.error("[deletePerson] MinIO cleanup failed:", err);
        }
      }

      revalidatePath("/people");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete person" };
    }

  });
}

export async function updatePersonBio(
  personId: string,
  bio: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const trimmed = bio.trim();
      await prisma.person.update({
        where: { id: personId },
        data: { bio: trimmed || null },
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update bio" };
    }

  });
}

export async function updatePersonPgrade(
  personId: string,
  pgrade: number | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (pgrade !== null && (pgrade < 1 || pgrade > 10)) {
        return { success: false, error: "PGRADE must be between 1 and 10" };
      }
      await prisma.person.update({
        where: { id: personId },
        data: { pgrade },
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update PGRADE" };
    }

  });
}

export async function updatePersonRating(
  personId: string,
  rating: number | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (rating !== null && (rating < 1 || rating > 5)) {
        return { success: false, error: "Rating must be between 1 and 5" };
      }
      await prisma.person.update({
        where: { id: personId },
        data: { rating },
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update rating" };
    }

  });
}

export async function loadMorePersons(
  filters: PersonFilters,
  cursor: string,
  slot?: number,
) {
  return withTenantFromHeaders(async () => {
    const result = await getPersonsPaginated(filters, cursor, 50);
    const personIds = result.items.map((p) => p.id);

    const headshotMap = await getHeadshotsForPersons(personIds, slot);

    const photoMap: Record<string, { url: string; focalX: number | null; focalY: number | null }> = {};
    for (const id of personIds) {
      const headshot = headshotMap.get(id);
      if (headshot) {
        photoMap[id] = headshot;
      }
    }

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      photoMap,
    };

  });
}