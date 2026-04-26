"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
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
  resolveCreditAsArtistRaw,
  deleteCreditRaw,
  getRecentChannels,
  getLastUsedSetType,
  createManualLabelEvidence,
  deleteLabelEvidence,
  getSuggestedResolutions,
  addExistingMediaToSet,
  removeMediaFromSet,
  reassignSetPrimarySession,
  splitMediaToSession,
} from "@/lib/services/set-service";
import type { SetFilters } from "@/lib/services/set-service";
import { getCoverPhotosForSets, getSkillEventMediaConstraints, getHeadshotsForPersons } from "@/lib/services/media-service";
import { cascadeHardDeleteMediaItems } from "@/lib/services/cascade-helpers";
import { searchArtists, getSuggestedArtists } from "@/lib/services/artist-service";
import { refreshDashboardStats } from "@/lib/services/view-service";
import { onMediaImportChanged } from "@/lib/services/coherence-service";
import { getLabels } from "@/lib/services/label-service";
import { prisma } from "@/lib/db";
import { z } from "zod";
import type { CrudActionResult, SimpleActionResult } from "@/lib/types";

type SetIdResult =
  | { success: true; setId: string }
  | { success: false; error: string };

export async function createSetStandalone(raw: unknown): Promise<SetIdResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function saveSetCredits(
  setId: string,
  rawCredits: unknown[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function saveSetLabelEvidence(
  setId: string,
  rawEvidence: unknown[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function resolveCredit(
  creditId: string,
  personId: string,
  setId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await resolveCreditRaw(creditId, personId);
      revalidatePath("/sets");
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to resolve credit" };
    }

  });
}

export async function ignoreCredit(creditId: string, setId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await ignoreCreditRaw(creditId);
      revalidatePath("/sets");
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to ignore credit" };
    }

  });
}

export async function unresolveCredit(creditId: string, setId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await unresolveCreditRaw(creditId);
      revalidatePath("/sets");
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to unresolve credit" };
    }

  });
}

export async function deleteCredit(creditId: string, setId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteCreditRaw(creditId);
      revalidatePath("/sets");
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete credit" };
    }
  });
}

export async function resolveCreditAsArtist(
  creditId: string,
  artistId: string,
  setId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await resolveCreditAsArtistRaw(creditId, artistId);
      revalidatePath("/sets");
      revalidatePath(`/sets/${setId}`);
      revalidatePath("/artists");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to resolve credit as artist" };
    }
  });
}

export async function searchArtistsAction(q: string) {
  return withTenantFromHeaders(async () => {
    if (!q.trim()) return [];
    return searchArtists(q.trim());
  });
}

export async function getSuggestedArtistsAction(rawName: string) {
  return withTenantFromHeaders(async () => {
    return getSuggestedArtists(rawName);
  });
}

export async function searchPersonsAction(q: string) {
  return withTenantFromHeaders(async () => {
    if (!q.trim()) return [];
    return searchPersonsForSelect(q.trim());

  });
}

export async function updateSet(raw: unknown): Promise<CrudActionResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function deleteSet(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteSetRecord(id);
      revalidatePath("/sets");
      revalidatePath("/sessions");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to delete set" };
    }

  });
}

const INLINE_EDITABLE_FIELDS = new Set(["title", "description", "notes"]);

export async function toggleSetComplete(
  id: string,
  isComplete: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateSetRecord(id, { isComplete });
      revalidatePath(`/sets/${id}`);
      revalidatePath("/sets");
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update set" };
    }
  });
}

export async function updateSetField(
  id: string,
  field: string,
  value: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function getSuggestionsAction(rawName: string, channelId: string | null) {
  return withTenantFromHeaders(async () => {
    return getSuggestedResolutions(rawName, channelId);

  });
}

export async function searchLabelsAction(q: string) {
  return withTenantFromHeaders(async () => {
    if (!q.trim()) return [];
    const labels = await getLabels(q.trim());
    return labels.slice(0, 20).map((l) => ({ id: l.id, name: l.name }));

  });
}

export async function addManualLabelEvidence(
  setId: string,
  labelId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await createManualLabelEvidence(setId, labelId);
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to add label evidence" };
    }

  });
}

export async function removeLabelEvidence(
  setId: string,
  labelId: string,
  evidenceType: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
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

  });
}

export async function setSetCover(
  setId: string,
  mediaItemId: string | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.set.update({
        where: { id: setId },
        data: { coverMediaItemId: mediaItemId },
      });
      revalidatePath("/sets");
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to update cover image" };
    }

  });
}

export async function getRecentDefaults() {
  return withTenantFromHeaders(async () => {
    const [recentChannelIds, lastType] = await Promise.all([
      getRecentChannels(5),
      getLastUsedSetType(),
    ]);
    return { recentChannelIds, lastType };

  });
}

export async function addExistingMediaToSetAction(
  setId: string,
  mediaItemIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await addExistingMediaToSet(setId, mediaItemIds);
      void onMediaImportChanged(setId);
      revalidatePath(`/sets/${setId}`);
      revalidatePath("/sets");
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to add media to set";
      return { success: false, error: message };
    }

  });
}

export async function removeMediaFromSetAction(
  setId: string,
  mediaItemIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await removeMediaFromSet(setId, mediaItemIds);
      void onMediaImportChanged(setId);
      revalidatePath(`/sets/${setId}`);
      revalidatePath("/sets");
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to remove media from set";
      return { success: false, error: message };
    }

  });
}

export async function reassignSetSessionAction(
  setId: string,
  targetSessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await reassignSetPrimarySession(setId, targetSessionId);
      revalidatePath(`/sets/${setId}`);
      revalidatePath("/sets");
      revalidatePath("/sessions");
      return { success: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to reassign session";
      return { success: false, error: message };
    }

  });
}

export async function deleteSetMediaAction(
  setId: string,
  primarySessionId: string,
  mediaItemIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const variantsList = await prisma.$transaction(async (tx) => {
        return cascadeHardDeleteMediaItems(tx, mediaItemIds);
      });
      try {
        const { deleteMediaFiles } = await import("@/lib/media-upload");
        await deleteMediaFiles(variantsList);
      } catch (err) {
        console.error("[deleteSetMediaAction] MinIO cleanup failed:", err);
      }
      await refreshDashboardStats();
      revalidatePath(`/sets/${setId}`);
      if (primarySessionId) revalidatePath(`/sessions/${primarySessionId}`);
      revalidatePath("/sets");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function reorderSetMediaAction(
  setId: string,
  orderedMediaItemIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < orderedMediaItemIds.length; i++) {
          await tx.setMediaItem.update({
            where: { setId_mediaItemId: { setId, mediaItemId: orderedMediaItemIds[i] } },
            data: { sortOrder: i },
          });
        }
      });
      revalidatePath(`/sets/${setId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

type SplitMediaResult =
  | { success: true }
  | { success: false; error: string; blockedItems?: { mediaItemId: string; filename: string; skillEventCount: number }[] };

export async function splitMediaToSessionAction(
  setId: string,
  sourceSessionId: string,
  mediaItemIds: string[],
  targetSessionId: string,
): Promise<SplitMediaResult> {
  return withTenantFromHeaders(async () => {
    try {
      // Pre-flight: block photos linked to skill events
      const constraints = await getSkillEventMediaConstraints(mediaItemIds);
      if (constraints.length > 0) {
        // Fetch filenames for the blocked items to show in the error
        const blockedMediaItems = await prisma.mediaItem.findMany({
          where: { id: { in: constraints.map((c) => c.mediaItemId) } },
          select: { id: true, filename: true },
        });
        const filenameMap = new Map(blockedMediaItems.map((m) => [m.id, m.filename]));
        return {
          success: false,
          error: "Some photos are linked to skill events and cannot be moved.",
          blockedItems: constraints.map((c) => ({
            mediaItemId: c.mediaItemId,
            filename: filenameMap.get(c.mediaItemId) ?? c.mediaItemId,
            skillEventCount: c.skillEventCount,
          })),
        };
      }

      await splitMediaToSession(setId, mediaItemIds, targetSessionId);

      revalidatePath(`/sets/${setId}`);
      revalidatePath(`/sessions/${sourceSessionId}`);
      revalidatePath(`/sessions/${targetSessionId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function loadMoreSets(
  filters: SetFilters,
  cursor: string,
) {
  return withTenantFromHeaders(async () => {
    const result = await getSetsPaginated(filters, cursor, 50);
    const personIds = [
      ...new Set(result.items.flatMap((s) => s.participants.map((p) => p.personId))),
    ];
    const [coverMapRaw, headshotMapRaw] = await Promise.all([
      getCoverPhotosForSets(result.items.map((s) => s.id)),
      getHeadshotsForPersons(personIds),
    ]);
    const photoMap = Object.fromEntries(coverMapRaw);
    const headshotMap = Object.fromEntries(headshotMapRaw);
    return {
      items: result.items,
      nextCursor: result.nextCursor,
      photoMap,
      headshotMap,
    };

  });
}
