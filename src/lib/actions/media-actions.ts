"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  updatePersonMediaLink,
  batchUpdatePersonMediaLinks,
  batchSetUsage,
  batchRemoveUsage,
  setEntityMediaCover,
  type EntityMediaModel,
} from "@/lib/services/media-service";
import { cascadeHardDeleteMediaItems } from "@/lib/services/cascade-helpers";
import { refreshDashboardStats } from "@/lib/services/view-service";
import type { PersonMediaLinkUpdate } from "@/lib/services/media-service";
import type { PersonMediaUsage, SimpleActionResult } from "@/lib/types";

export async function assignHeadshotSlot(
  personId: string,
  mediaItemId: string,
  slot: number,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        // Carry the ★ avatar over if the image previously in this slot was the avatar.
        const prev = await tx.personMediaLink.findFirst({
          where: { personId, usage: "HEADSHOT", slot },
          select: { isAvatar: true },
        });
        const inheritAvatar = prev?.isAvatar ?? false;

        // Remove the HEADSHOT link from whatever image previously held this slot
        await tx.personMediaLink.deleteMany({
          where: { personId, usage: "HEADSHOT", slot },
        });

        // Upsert the link for this person+media+HEADSHOT
        await tx.personMediaLink.upsert({
          where: {
            personId_mediaItemId_usage: {
              personId,
              mediaItemId,
              usage: "HEADSHOT",
            },
          },
          update: { slot, ...(inheritAvatar ? { isAvatar: true } : {}) },
          create: {
            personId,
            mediaItemId,
            usage: "HEADSHOT",
            slot,
            isAvatar: inheritAvatar,
          },
        });
      });

      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

export async function clearSlotAction(
  personId: string,
  slot: number,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.personMediaLink.deleteMany({ where: { personId, usage: "HEADSHOT", slot } });
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to clear slot" };
    }
  });
}

export async function removeHeadshotSlot(
  personId: string,
  mediaItemId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.personMediaLink.deleteMany({
        where: { personId, mediaItemId, usage: "HEADSHOT" },
      });

      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }

  });
}

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

      const source = await prisma.mediaItem.findUnique({
        where: { id: sourceMediaItemId },
        select: {
          filename: true,
          fileRef: true,
          mimeType: true,
          size: true,
          originalWidth: true,
          originalHeight: true,
          variants: true,
          hash: true,
          phash: true,
        },
      });
      if (!source) return { success: false, error: "Source media item not found", code: "SOURCE_NOT_FOUND" };

      const { copyMediaFilesToReference } = await import("@/lib/media-upload");
      const { variants: newVariants, fileRef: newFileRef } = await copyMediaFilesToReference(
        (source.variants ?? {}) as import("@/lib/types").PhotoVariants,
        source.fileRef,
        destRefSessionId,
      );

      const newItem = await prisma.mediaItem.create({
        data: {
          sessionId: destRefSessionId,
          mediaType: "PHOTO",
          filename: source.filename,
          fileRef: newFileRef,
          mimeType: source.mimeType,
          size: source.size,
          originalWidth: source.originalWidth,
          originalHeight: source.originalHeight,
          variants: newVariants as Record<string, string>,
          tags: [],
          // Preserve dedup hashes so existing similarity / duplicate queries
          // see the copy too. Variants point at fresh MinIO keys so the
          // bytes are duplicated, but content-identity is preserved.
          hash: source.hash,
          phash: source.phash,
          isAnnotation: false,
          copiedFromMediaItemId: sourceMediaItemId,
        },
        select: { id: true },
      });

      revalidatePath(`/people/${personId}`);
      return {
        success: true,
        newMediaItemId: newItem.id,
        personName: person.aliases[0]?.name ?? "Unknown",
        referenceSessionId: destRefSessionId,
      };
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
            slot: old.slot,
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

export async function setPersonAvatarAction(
  personId: string,
  mediaItemId: string,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.personMediaLink.updateMany({
          where: { personId, isAvatar: true },
          data: { isAvatar: false },
        });
        await tx.personMediaLink.updateMany({
          where: { personId, mediaItemId },
          data: { isAvatar: true },
        });
      });
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      return { success: false, error: message };
    }
  });
}
