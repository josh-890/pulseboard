"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import type { BulkShownMode } from "@/lib/image-shown";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  updatePersonMediaLink,
  batchUpdatePersonMediaLinks,
  batchSetUsage,
  batchRemoveUsage,
  setEntityMediaCover,
  ensureReferenceSession,
  copyMediaToReferenceSession,
  type EntityMediaModel,
} from "@/lib/services/media-service";
import { cascadeHardDeleteMediaItems } from "@/lib/services/cascade-helpers";
import {
  setHiddenPersons,
  bulkHidePersons,
  bulkShowPersons,
  setShownSupport,
  setBackgroundPersons,
  bulkSetFocus,
} from "@/lib/services/appearance-service";
import { refreshDashboardStats } from "@/lib/services/view-service";
import { setMediaFavorite } from "@/lib/services/media-mark-service";
import type { PersonMediaLinkUpdate } from "@/lib/services/media-service";
import {
  assignImageToDetailCategory,
  getCategoryUseMarks,
  getDetailDuplicates,
  type AssignToDetailResult,
  type DetailDuplicateGroup,
} from "@/lib/services/detail-use-service";
import type { PersonMediaUsage, SimpleActionResult } from "@/lib/types";

export async function updatePersonMediaLinkAction(
  linkId: string,
  data: PersonMediaLinkUpdate,
  personId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updatePersonMediaLink(linkId, data);
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function batchUpdateLinksAction(
  linkIds: string[],
  data: PersonMediaLinkUpdate,
  personId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await batchUpdatePersonMediaLinks(linkIds, data);
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function batchSetUsageAction(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await batchSetUsage(personId, mediaItemIds, usage);
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function removePersonMediaLinkAction(
  personId: string,
  mediaItemId: string,
  usage: PersonMediaUsage,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.personMediaLink.deleteMany({
        where: {
          personId,
          mediaItemId,
          usage,
        },
      });
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function batchRemoveUsageAction(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await batchRemoveUsage(personId, mediaItemIds, usage);
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function upsertPersonMediaLinkAction(
  personId: string,
  mediaItemId: string,
  usage: PersonMediaUsage,
  data: Omit<PersonMediaLinkUpdate, "usage">,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      // For DETAIL usage, match by categoryId; for others, match by usage
      const whereClause =
        usage === "DETAIL" && data.categoryId
          ? { personId, mediaItemId, usage, categoryId: data.categoryId }
          : { personId, mediaItemId, usage };

      const existing = await prisma.personMediaLink.findFirst({
        where: whereClause,
      });

      if (existing) {
        await prisma.personMediaLink.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.personMediaLink.create({
          data: {
            personId,
            mediaItemId,
            usage,
            ...data,
          },
        });
      }

      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function setFocalPointAction(
  mediaItemId: string,
  focalX: number,
  focalY: number,
  sessionId: string,
  personId?: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const clampedX = Math.min(1, Math.max(0, focalX));
      const clampedY = Math.min(1, Math.max(0, focalY));

      await prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: {
          focalX: clampedX,
          focalY: clampedY,
          focalSource: "manual",
          focalStatus: "done",
        },
      });

      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath("/people");
      if (personId) revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function reorderPersonMediaAction(
  personId: string,
  orderedMediaItemIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < orderedMediaItemIds.length; i++) {
          await tx.personMediaLink.updateMany({
            where: { personId, mediaItemId: orderedMediaItemIds[i] },
            data: { sortOrder: i },
          });
        }
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

/**
 * Make a photo the cover (first / body-map hover) of a body feature. Entity-scoped
 * so it doesn't disturb the same image's other links — see setEntityMediaCover.
 */
export async function setEntityMediaCoverAction(
  personId: string,
  entityModel: EntityMediaModel,
  entityId: string,
  mediaItemId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setEntityMediaCover(personId, entityModel, entityId, mediaItemId);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// ADR-0019: global per-image favorite. Toggles MediaItem.isFavorite (app-wide),
// superseding the per-person setPersonMediaFavoriteAction. Feeds /favorites.
export async function setMediaFavoriteAction(
  mediaItemId: string,
  isFavorite: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      // With the marks ★ implies: outtake when set, iconic gone when cleared
      await setMediaFavorite([mediaItemId], isFavorite);
      revalidatePath("/favorites");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// A damaged source file (MediaItem.decodeIssue) was looked at and the stored
// image is fine as it is: drop the red frame — and stop the archive agent from
// fetching it again (archiveRetry). Replacing the file also clears both.
export async function clearMediaDecodeIssueAction(mediaItemId: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: { decodeIssue: null, archiveRetry: false },
      });
      revalidatePath("/");
      return { success: true };
    } catch (err) {
      console.error("[clearMediaDecodeIssueAction] failed:", mediaItemId, err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// The same for several images at once — the dashboard's Dismiss on a set's (or a
// session's) damaged images, e.g. one you already dealt with elsewhere.
export async function clearMediaDecodeIssuesAction(mediaItemIds: string[]): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.mediaItem.updateMany({
        where: { id: { in: mediaItemIds } },
        data: { decodeIssue: null, archiveRetry: false },
      });
      revalidatePath("/");
      return { success: true };
    } catch (err) {
      console.error("[clearMediaDecodeIssuesAction] failed:", mediaItemIds, err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// ── Per-image appearance ("people shown", ADR-0023) ──────────────────────────
// Stored as exclusions: `hiddenPersonIds` = the cast members NOT shown in this image.
export async function setMediaShownPeopleAction(
  mediaItemId: string,
  hiddenPersonIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setHiddenPersons(mediaItemId, hiddenPersonIds);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// Support on one image (2026-10-24): who of the people only appearing it shows.
// `focusPersonIds` (ADR-0039): who of them is the focus; left out, focus marks are kept.
export async function setMediaShownSupportAction(
  mediaItemId: string,
  shownPersonIds: string[],
  focusPersonIds?: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setShownSupport(mediaItemId, shownPersonIds, focusPersonIds);
      return { success: true };
    } catch (err) {
      console.error("[setMediaShownSupportAction] failed:", mediaItemId, err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// Focus on one image (ADR-0039): the leads only in the shot, not its focus.
export async function setMediaBackgroundPeopleAction(
  mediaItemId: string,
  backgroundPersonIds: string[],
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await setBackgroundPersons(mediaItemId, backgroundPersonIds);
      return { success: true };
    } catch (err) {
      console.error("[setMediaBackgroundPeopleAction] failed:", mediaItemId, err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// Bulk across many selected images: hide, show, or (ADR-0039) show as the focus /
// only in the shot.

export async function bulkSetShownPeopleAction(
  mediaItemIds: string[],
  personIds: string[],
  mode: BulkShownMode,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      if (mode === "hide") await bulkHidePersons(mediaItemIds, personIds);
      else if (mode === "show") await bulkShowPersons(mediaItemIds, personIds);
      else await bulkSetFocus(mediaItemIds, personIds, mode);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// Deprecated (ADR-0019): per-person favorite. Retained until callers are gone.
export async function setPersonMediaFavoriteAction(
  personId: string,
  mediaItemId: string,
  isFavorite: boolean,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.personMediaLink.updateMany({
        where: { personId, mediaItemId },
        data: { isFavorite },
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function deleteMediaItemsAction(
  mediaItemIds: string[],
  personId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const variantsList = await prisma.$transaction(async (tx) => {
        return cascadeHardDeleteMediaItems(tx, mediaItemIds);
      });

      // Best-effort file cleanup after commit; queue orphaned keys on failure for retry
      try {
        const { deleteMediaFiles } = await import("@/lib/media-upload");
        await deleteMediaFiles(variantsList);
      } catch (err) {
        console.error("[deleteMediaItemsAction] MinIO cleanup failed:", err);
        await prisma.orphanedStorageKey.createMany({
          data: variantsList.flatMap(v =>
            Object.values(v).filter((k): k is string => typeof k === "string" && k.length > 0)
              .map(key => ({ key, reason: "delete_cleanup_failed" }))
          ),
        }).catch(() => {});
      }

      await refreshDashboardStats();
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      revalidatePath("/people");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

// `referenceSessionId` is optional — when omitted the action derives it
// from Person.referenceSession. Returns a NO_REF_SESSION error code when
// the target person hasn't been given a reference session yet, so callers
// (e.g. the production-set lightbox) can show a precise toast instead of
// a generic message. Existing callers that already have the refSession
// can keep passing it explicitly — same behaviour.
export type CopyToReferenceResult =
  | { success: true; newMediaItemId: string; personName: string; referenceSessionId: string }
  | { success: false; error: string; code?: "NO_REF_SESSION" | "SOURCE_NOT_FOUND" | "PERSON_NOT_FOUND" };

export async function copyMediaItemToReferenceAction(
  sourceMediaItemId: string,
  personId: string,
  referenceSessionId?: string,
): Promise<CopyToReferenceResult> {
  return withTenantFromHeaders(async () => {
    try {
      // Resolve the destination reference session if not supplied.
      let destRefSessionId = referenceSessionId;
      const person = await prisma.person.findUnique({
        where: { id: personId },
        select: {
          referenceSession: { select: { id: true } },
          aliases: { where: { isCommon: true }, take: 1, select: { name: true } },
        },
      });
      if (!person) return { success: false, error: "Person not found", code: "PERSON_NOT_FOUND" };
      if (!destRefSessionId) destRefSessionId = person.referenceSession?.id;
      if (!destRefSessionId) {
        const name = person.aliases[0]?.name ?? "this person";
        return {
          success: false,
          error: `${name} has no reference session yet`,
          code: "NO_REF_SESSION",
        };
      }

      const newMediaItemId = await copyMediaToReferenceSession(sourceMediaItemId, destRefSessionId);

      revalidatePath(`/people/${personId}`);
      return {
        success: true,
        newMediaItemId,
        personName: person.aliases[0]?.name ?? "Unknown",
        referenceSessionId: destRefSessionId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

// ADR follow-up — reverse "assign photo → person's detail category" (always-copy).
// Copies the source into the person's reference session (auto-creating it if
// needed), then creates the DETAIL link on the copy. If the source is ALREADY in
// the person's reference session, links it directly (the only case a MOVE can
// occur, given @@unique([personId, mediaItemId, usage])).

// Resolve the person's reference session id (creating it if absent) — used by
// the "Align" path of the assign flow, which needs a destination session.
export async function ensureReferenceSessionAction(
  personId: string,
): Promise<{ success: boolean; referenceSessionId?: string; error?: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const referenceSessionId = await ensureReferenceSession(personId);
      return { success: true, referenceSessionId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });
}

export async function assignMediaToDetailCategoryAction(
  sourceMediaItemId: string,
  personId: string,
  categoryId: string,
  opts: Parameters<typeof assignImageToDetailCategory>[3] = {},
): Promise<AssignToDetailResult> {
  return withTenantFromHeaders(async () => {
    try {
      const res = await assignImageToDetailCategory(sourceMediaItemId, personId, categoryId, opts);
      if (res.success) revalidatePath(`/people/${personId}`);
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}

export async function linkMediaToDetailCategoryAction(
  personId: string,
  mediaItemIds: string[],
  categoryId: string,
  entityField?: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
  entityId?: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      for (const mediaItemId of mediaItemIds) {
        // Search without categoryId: @@unique([personId, mediaItemId, usage]) means
        // there can only be ONE DETAIL link per person+media regardless of category.
        // Filtering by categoryId misses existing links with a different category and
        // causes a silent unique-constraint violation on the subsequent create.
        const existing = await prisma.personMediaLink.findFirst({
          where: { personId, mediaItemId, usage: "DETAIL" },
          select: { id: true },
        });
        if (!existing) {
          await prisma.personMediaLink.create({
            data: {
              personId,
              mediaItemId,
              usage: "DETAIL",
              categoryId,
              ...(entityField && entityId ? { [entityField]: entityId } : {}),
            },
          });
        } else {
          // Update: set the (possibly new) category and entity FK.
          // Handles orphaned records created by the old broken flow (bodyMarkId = null)
          // and photos re-assigned from one entity/category to another.
          await prisma.personMediaLink.update({
            where: { id: existing.id },
            data: {
              categoryId,
              ...(entityField && entityId ? { [entityField]: entityId } : {}),
            },
          });
        }
      }
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

/**
 * Mark one image as the representative for a (person, category) framing (ADR-0016).
 * ≤1 per person+category — clears the others in the same category first. The avatar
 * is the representative of the avatar-source (Headshot) category.
 */
export async function setRepresentativeAction(
  personId: string,
  mediaItemId: string,
  categoryId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.personMediaLink.updateMany({
          where: { personId, categoryId, isRepresentative: true },
          data: { isRepresentative: false },
        });
        await tx.personMediaLink.updateMany({
          where: { personId, mediaItemId, categoryId },
          data: { isRepresentative: true },
        });
      });
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to set representative" };
    }
  });
}

export async function unlinkMediaFromDetailCategoryAction(
  personId: string,
  mediaItemIds: string[],
  categoryId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.personMediaLink.deleteMany({
        where: {
          personId,
          mediaItemId: { in: mediaItemIds },
          usage: "DETAIL",
          categoryId,
        },
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function batchEntityLinkAction(
  personId: string,
  mediaItemIds: string[],
  categoryId: string,
  entityField: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
  entityId: string,
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      for (const mediaItemId of mediaItemIds) {
        const existing = await prisma.personMediaLink.findFirst({
          where: { personId, mediaItemId, usage: "DETAIL", categoryId },
        });
        if (existing) {
          await prisma.personMediaLink.update({
            where: { id: existing.id },
            data: { [entityField]: entityId },
          });
        } else {
          await prisma.personMediaLink.create({
            data: {
              personId,
              mediaItemId,
              usage: "DETAIL",
              categoryId,
              [entityField]: entityId,
            },
          });
        }
      }
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function batchSetBodyRegionsAction(
  personId: string,
  mediaItemIds: string[],
  bodyRegions: string[],
  sessionId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      // Update bodyRegions on all DETAIL links for the given media items
      await prisma.personMediaLink.updateMany({
        where: {
          personId,
          mediaItemId: { in: mediaItemIds },
        },
        data: { bodyRegions },
      });
      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function resetFocalPointAction(
  mediaItemId: string,
  sessionId: string,
  personId?: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: {
          focalX: null,
          focalY: null,
          focalSource: null,
          focalStatus: null,
          modelVersion: null,
        },
      });

      revalidatePath(`/sessions/${sessionId}`);
      revalidatePath("/people");
      if (personId) revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

/**
 * Swap a PersonMediaLink to point at a new MediaItem, preserving all entity
 * bindings (bodyMarkId, categoryId, etc.) on the original link.
 * The old MediaItem is left untouched — it may be used in production sets or elsewhere.
 */
export async function swapPersonMediaLinkAction(
  personId: string,
  oldMediaItemId: string,
  newMediaItemId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const old = await prisma.personMediaLink.findFirst({
        where: { personId, mediaItemId: oldMediaItemId },
      });
      if (!old) return { success: false, error: "Original link not found" };

      await prisma.$transaction(async (tx) => {
        await tx.personMediaLink.create({
          data: {
            personId: old.personId,
            mediaItemId: newMediaItemId,
            usage: old.usage,
            categoryId: old.categoryId,
            bodyMarkId: old.bodyMarkId,
            bodyModificationId: old.bodyModificationId,
            cosmeticProcedureId: old.cosmeticProcedureId,
            sortOrder: old.sortOrder,
            notes: old.notes,
            eraId: old.eraId,
            bodyRegion: old.bodyRegion,
            bodyRegions: old.bodyRegions,
          },
        });
        await tx.personMediaLink.delete({ where: { id: old.id } });
      });

      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}


// Picker badges (2026-11-12): which of these source photos are already a copy in,
// or aligned into, this person's detail category.
export async function getCategoryUseMarksAction(
  personId: string,
  categoryId: string,
  sourceMediaItemIds: string[],
): Promise<Record<string, ("copy" | "aligned")[]>> {
  return withTenantFromHeaders(async () => {
    try {
      return await getCategoryUseMarks(personId, categoryId, sourceMediaItemIds);
    } catch (err) {
      console.error("[getCategoryUseMarksAction]", err);
      return {};
    }
  });
}

// Same file twice or more in one of this person's detail categories (2026-11-12).
export async function getDetailDuplicatesAction(personId: string): Promise<DetailDuplicateGroup[]> {
  return withTenantFromHeaders(async () => {
    try {
      return await getDetailDuplicates(personId);
    } catch (err) {
      console.error("[getDetailDuplicatesAction]", err);
      return [];
    }
  });
}

// ─── Cover art (ADR-0040) ────────────────────────────────────────────────────

async function revalidatePlaces(ids: string[]): Promise<void> {
  const { placesOfMedia } = await import("@/lib/services/cover-art-service");
  const { setIds, sessionIds } = await placesOfMedia(ids);
  for (const id of setIds) revalidatePath(`/sets/${id}`);
  for (const id of sessionIds) revalidatePath(`/sessions/${id}`);
  revalidatePath("/sets");
}

/** "This is cover art" / "Not cover art" on one or more files */
export async function setMediaRoleAction(
  mediaItemIds: string[],
  role: "PHOTO" | "COVER_ART",
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { setMediaRole } = await import("@/lib/services/cover-art-service");
      await setMediaRole(mediaItemIds, role);
      await revalidatePlaces(mediaItemIds);
      return { success: true };
    } catch (err) {
      console.error("[setMediaRoleAction]", err);
      return { success: false, error: "Failed to change the file's role" };
    }
  });
}

/** "+ add to photos" / "Remove from photos" on a cover-art file */
export async function setArtInPhotosAction(mediaItemId: string, on: boolean): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { setArtInPhotos } = await import("@/lib/services/cover-art-service");
      await setArtInPhotos(mediaItemId, on);
      await revalidatePlaces([mediaItemId]);
      return { success: true };
    } catch (err) {
      console.error("[setArtInPhotosAction]", err);
      return { success: false, error: "Failed to update the cover art" };
    }
  });
}

/** The reviewed cleanup of cover-art duplicates (ADR-0040) — only the ids you kept selected */
export async function deleteCoverDuplicatesAction(
  ids: string[],
): Promise<{ success: true; deleted: number } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const { deleteCoverDuplicates } = await import("@/lib/services/cover-art-cleanup-service");
      const deleted = await deleteCoverDuplicates(ids);
      revalidatePath("/settings/system/cover-duplicates");
      revalidatePath("/sets");
      return { success: true as const, deleted };
    } catch (err) {
      console.error("[deleteCoverDuplicatesAction]", err);
      return { success: false as const, error: "Failed to delete the duplicates" };
    }
  });
}

/** The cover check (ADR-0040 addendum): ticked sets switch to their cover art, the rest keep their cover as picked */
export async function applyCoverCheckAction(
  switchSetIds: string[],
  keepSetIds: string[],
): Promise<{ success: true; switched: number; kept: number } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const { applyCoverCheck } = await import("@/lib/services/cover-check-service");
      const r = await applyCoverCheck(switchSetIds, keepSetIds);
      revalidatePath("/settings/system/cover-check");
      revalidatePath("/sets");
      return { success: true as const, ...r };
    } catch (err) {
      console.error("[applyCoverCheckAction]", err);
      return { success: false as const, error: "Failed to update the covers" };
    }
  });
}

// ─── Color / B&W (ADR-0041) ──────────────────────────────────────────────────

/** "Color" / "B&W" by hand on one or more photos; null hands them back to the measurement */
export async function setMediaToneAction(
  mediaItemIds: string[],
  tone: "COLOR" | "MONO" | null,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      const { setMediaTone } = await import("@/lib/services/tone-service");
      await setMediaTone(mediaItemIds, tone);
      await revalidatePlaces(mediaItemIds);
      return { success: true };
    } catch (err) {
      console.error("[setMediaToneAction]", err);
      return { success: false, error: "Failed to change color / B&W" };
    }
  });
}

/** The tone check's decisions (Settings → System → Tone check) */
export async function applyToneCheckAction(
  decisions: { id: string; tone: "COLOR" | "MONO" }[],
): Promise<{ success: true; saved: number } | { success: false; error: string }> {
  return withTenantFromHeaders(async () => {
    try {
      const { applyToneCheck } = await import("@/lib/services/tone-service");
      const saved = await applyToneCheck(decisions);
      revalidatePath("/settings/system/tone-check");
      revalidatePath("/sets");
      return { success: true as const, saved };
    } catch (err) {
      console.error("[applyToneCheckAction]", err);
      return { success: false as const, error: "Failed to save the decisions" };
    }
  });
}
