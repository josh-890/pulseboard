"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { createSessionSchema, updateSessionSchema } from "@/lib/validations/session";
import {
  createSessionRecord,
  updateSessionRecord,
  deleteSessionRecord,
  mergeSessionsRecord,
  searchSessions,
  linkSessionToSet,
  unlinkSessionFromSet,
  getSessionsPaginated,
} from "@/lib/services/session-service";
import type { SessionFilters } from "@/lib/services/session-service";
import { getCoverPhotosForSessions } from "@/lib/services/media-service";
import { prisma } from "@/lib/db";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

export async function createSession(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = createSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      const session = await createSessionRecord(parsed.data);

      // Log activity
      await prisma.activity.create({
        data: {
          title: `Session "${session.name}" created`,
          time: new Date(),
          type: "session_added",
        },
      });

      revalidatePath("/sessions");
      revalidatePath("/");
      return { success: true, id: session.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }

  });
}

export async function updateSession(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
    const parsed = updateSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.flatten() };
    }

    try {
      await updateSessionRecord(parsed.data.id, parsed.data);
      revalidatePath("/sessions");
      revalidatePath(`/sessions/${parsed.data.id}`);
      return { success: true, id: parsed.data.id };
    } catch {
      return { success: false, error: "Unexpected error" };
    }

  });
}

export async function deleteSession(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteSessionRecord(id);
      revalidatePath("/sessions");
      revalidatePath("/");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete session" };
    }

  });
}

const INLINE_EDITABLE_FIELDS = new Set(["name", "description", "notes", "location"]);

export async function setSessionStatusAction(
  id: string,
  status: "DRAFT" | "CONFIRMED",
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateSessionRecord(id, { status });
      revalidatePath(`/sessions/${id}`);
      revalidatePath("/sessions");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update status" };
    }

  });
}

export async function updateSessionField(
  id: string,
  field: string,
  value: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    if (!INLINE_EDITABLE_FIELDS.has(field)) {
      return { success: false, error: `Field "${field}" is not inline-editable` };
    }

    if (field === "name" && !value.trim()) {
      return { success: false, error: "Name cannot be empty" };
    }

    try {
      await updateSessionRecord(id, { [field]: value || null });
      revalidatePath(`/sessions/${id}`);
      revalidatePath("/sessions");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update field" };
    }

  });
}

export async function mergeSessions(
  survivingId: string,
  absorbedId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await mergeSessionsRecord(survivingId, absorbedId);
      revalidatePath("/sessions");
      revalidatePath(`/sessions/${survivingId}`);
      revalidatePath("/sets");
      revalidatePath("/");
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to merge sessions";
      return { success: false, error: message };
    }

  });
}

export async function searchSessionsAction(q: string) {
  return withTenantFromHeaders(async () => {
    if (!q.trim()) return [];
    return searchSessions(q.trim());

  });
}

export async function linkSessionAction(
  setId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await linkSessionToSet(setId, sessionId);
      revalidatePath(`/sets/${setId}`);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to link session";
      return { success: false, error: message };
    }

  });
}

export async function unlinkSessionAction(
  setId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await unlinkSessionFromSet(setId, sessionId);
      revalidatePath(`/sets/${setId}`);
      revalidatePath(`/sessions/${sessionId}`);
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to unlink session";
      return { success: false, error: message };
    }

  });
}

export async function loadMoreSessions(
  filters: SessionFilters,
  cursor: string,
) {
  return withTenantFromHeaders(async () => {
    const result = await getSessionsPaginated(filters, cursor, 50);
    const coverMapRaw = await getCoverPhotosForSessions(
      result.items.map((s) => s.id),
    );
    const photoMap = Object.fromEntries(coverMapRaw);
    return {
      items: result.items,
      nextCursor: result.nextCursor,
      photoMap,
    };

  });
}
