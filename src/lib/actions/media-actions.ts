"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  updatePersonMediaLink,
  batchUpdatePersonMediaLinks,
  batchSetUsage,
  batchRemoveUsage,
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
          update: { slot },
          create: {
            personId,
            mediaItemId,
            usage: "HEADSHOT",
            slot,
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

      // Best-effort file cleanup after commit
      try {
        const { deleteMediaFiles } = await import("@/lib/media-upload");
        await deleteMediaFiles(variantsList);
      } catch (err) {
        console.error("[deleteMediaItemsAction] MinIO cleanup failed:", err);
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

export async function copyMediaItemToReferenceAction(
  sourceMediaItemId: string,
  personId: string,
  referenceSessionId: string,
): Promise<SimpleActionResult & { newMediaItemId?: string }> {
  return withTenantFromHeaders(async () => {
    try {
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
        },
      });
      if (!source) return { success: false, error: "Source media item not found" };

      const newItem = await prisma.mediaItem.create({
        data: {
          sessionId: referenceSessionId,
          mediaType: "PHOTO",
          filename: source.filename,
          fileRef: source.fileRef,
          mimeType: source.mimeType,
          size: source.size,
          originalWidth: source.originalWidth,
          originalHeight: source.originalHeight,
          variants: source.variants as Record<string, string>,
          tags: [],
          hash: null,
          phash: null,
          isAnnotation: false,
        },
        select: { id: true },
      });

      revalidatePath(`/people/${personId}`);
      return { success: true, newMediaItemId: newItem.id };
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
            personaId: old.personaId,
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
