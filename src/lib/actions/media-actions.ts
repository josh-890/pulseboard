"use server";

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
import type { PersonMediaUsage } from "@/lib/types";

type ActionResult = { success: boolean; error?: string };

export async function assignHeadshotSlot(
  personId: string,
  mediaItemId: string,
  slot: number,
): Promise<ActionResult> {
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
}

export async function removeHeadshotSlot(
  personId: string,
  mediaItemId: string,
): Promise<ActionResult> {
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
}

export async function updatePersonMediaLinkAction(
  linkId: string,
  data: PersonMediaLinkUpdate,
  personId: string,
  sessionId: string,
): Promise<ActionResult> {
  try {
    await updatePersonMediaLink(linkId, data);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function batchUpdateLinksAction(
  linkIds: string[],
  data: PersonMediaLinkUpdate,
  personId: string,
  sessionId: string,
): Promise<ActionResult> {
  try {
    await batchUpdatePersonMediaLinks(linkIds, data);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function batchSetUsageAction(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
  sessionId: string,
): Promise<ActionResult> {
  try {
    await batchSetUsage(personId, mediaItemIds, usage);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function removePersonMediaLinkAction(
  personId: string,
  mediaItemId: string,
  usage: PersonMediaUsage,
  sessionId: string,
): Promise<ActionResult> {
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
}

export async function batchRemoveUsageAction(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
  sessionId: string,
): Promise<ActionResult> {
  try {
    await batchRemoveUsage(personId, mediaItemIds, usage);
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function upsertPersonMediaLinkAction(
  personId: string,
  mediaItemId: string,
  usage: PersonMediaUsage,
  data: Omit<PersonMediaLinkUpdate, "usage">,
  sessionId: string,
): Promise<ActionResult> {
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
}

export async function setFocalPointAction(
  mediaItemId: string,
  focalX: number,
  focalY: number,
  sessionId: string,
  personId?: string,
): Promise<ActionResult> {
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
}

export async function deleteMediaItemsAction(
  mediaItemIds: string[],
  personId: string,
  sessionId: string,
): Promise<ActionResult> {
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
}

export async function linkMediaToDetailCategoryAction(
  personId: string,
  mediaItemIds: string[],
  categoryId: string,
  entityField?: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
  entityId?: string,
): Promise<ActionResult> {
  try {
    for (const mediaItemId of mediaItemIds) {
      const existing = await prisma.personMediaLink.findFirst({
        where: { personId, mediaItemId, usage: "DETAIL", categoryId },
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
      }
    }
    revalidatePath(`/people/${personId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function unlinkMediaFromDetailCategoryAction(
  personId: string,
  mediaItemIds: string[],
  categoryId: string,
): Promise<ActionResult> {
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
}

export async function batchEntityLinkAction(
  personId: string,
  mediaItemIds: string[],
  categoryId: string,
  entityField: "bodyMarkId" | "bodyModificationId" | "cosmeticProcedureId",
  entityId: string,
  sessionId: string,
): Promise<ActionResult> {
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
}

export async function batchSetBodyRegionsAction(
  personId: string,
  mediaItemIds: string[],
  bodyRegions: string[],
  sessionId: string,
): Promise<ActionResult> {
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
}

export async function resetFocalPointAction(
  mediaItemId: string,
  sessionId: string,
  personId?: string,
): Promise<ActionResult> {
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
}
