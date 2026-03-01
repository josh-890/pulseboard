"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  updatePersonMediaLink,
  batchUpdatePersonMediaLinks,
  batchSetUsage,
  batchRemoveUsage,
} from "@/lib/services/media-service";
import type { PersonMediaLinkUpdate } from "@/lib/services/media-service";
import type { PersonMediaUsage } from "@/lib/types";
import type { PhotoVariants } from "@/lib/types";

type ActionResult = { success: boolean; error?: string };

export async function assignHeadshotSlot(
  personId: string,
  mediaItemId: string,
  slot: number,
): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      // Clear any existing image in this slot for this person
      await tx.personMediaLink.updateMany({
        where: { personId, usage: "HEADSHOT", slot },
        data: { slot: null },
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
    await prisma.personMediaLink.upsert({
      where: {
        personId_mediaItemId_usage: { personId, mediaItemId, usage },
      },
      update: data,
      create: {
        personId,
        mediaItemId,
        usage,
        ...data,
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

export async function setFocalPointAction(
  mediaItemId: string,
  focalX: number,
  focalY: number,
  sessionId: string,
): Promise<ActionResult> {
  try {
    const clampedX = Math.min(1, Math.max(0, focalX));
    const clampedY = Math.min(1, Math.max(0, focalY));

    const mediaItem = await prisma.mediaItem.findUnique({
      where: { id: mediaItemId },
      select: { variants: true, originalWidth: true, originalHeight: true },
    });
    if (!mediaItem) return { success: false, error: "Media item not found" };

    await prisma.mediaItem.update({
      where: { id: mediaItemId },
      data: {
        focalX: clampedX,
        focalY: clampedY,
        focalSource: "manual",
        focalStatus: "done",
      },
    });

    // Regenerate profile variants with manual focal point
    const { regenerateProfileVariants } = await import("@/lib/photo-upload");
    const variants = (mediaItem.variants ?? {}) as PhotoVariants;
    if (variants.original) {
      const updatedVariants = await regenerateProfileVariants(
        variants,
        mediaItem.originalWidth,
        mediaItem.originalHeight,
        clampedX,
        clampedY,
      );
      await prisma.mediaItem.update({
        where: { id: mediaItemId },
        data: { variants: updatedVariants as unknown as Record<string, string> },
      });
    }

    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath("/people");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}

export async function resetFocalPointAction(
  mediaItemId: string,
  sessionId: string,
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
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return { success: false, error: message };
  }
}
