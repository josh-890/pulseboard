"use server";

import { withTenantFromHeaders } from "@/lib/tenant-context";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  createMotifTemplate,
  updateMotifTemplate,
  deleteMotifTemplate,
  getMotifTemplateForCategory,
  type MotifTemplateInput,
  type MotifTemplateRecord,
} from "@/lib/services/motif-template-service";
import type { SimpleActionResult } from "@/lib/types";

const CATALOG_PATH = "/settings/catalogs/motif-templates";
// Binding a template to a locus category mutates MediaCategory rows surfaced here.
const MEDIA_CATALOG_PATH = "/settings/catalogs/media";

/**
 * Finalize a freshly-uploaded baked motif image: tag it as normalized (template +
 * provenance), hide it from the main gallery (isAnnotation), and assign it to the
 * person's slot — replacing whatever previously held that slot.
 */
export async function assignMotifImageAction(
  personId: string,
  mediaItemId: string,
  slot: number,
  templateId: string,
  provenance: unknown,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.mediaItem.update({
          where: { id: mediaItemId },
          data: {
            motifTemplateId: templateId,
            motifProvenance: provenance as object,
            isAnnotation: true,
          },
        });
        // Carry the ★ avatar over from the image previously in this slot.
        const prev = await tx.personMediaLink.findFirst({
          where: { personId, usage: "HEADSHOT", slot },
          select: { isAvatar: true },
        });
        const inheritAvatar = prev?.isAvatar ?? false;
        await tx.personMediaLink.deleteMany({ where: { personId, usage: "HEADSHOT", slot } });
        await tx.personMediaLink.upsert({
          where: { personId_mediaItemId_usage: { personId, mediaItemId, usage: "HEADSHOT" } },
          update: { slot, ...(inheritAvatar ? { isAvatar: true } : {}) },
          create: { personId, mediaItemId, usage: "HEADSHOT", slot, isAvatar: inheritAvatar },
        });
      });
      revalidatePath("/people");
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to assign motif image" };
    }
  });
}

/**
 * Finalize a freshly-baked Aligned image for a locus category (ADR-0013/0014).
 * Unlike the headshot path, identity is the alignment-template binding +
 * provenance — NOT `isAnnotation` (annotations are a separate concept). The
 * baked copy is surfaced in the Details tab via a DETAIL link to the category.
 */
export async function assignAlignedImageAction(
  personId: string,
  mediaItemId: string,
  categoryId: string,
  templateId: string,
  provenance: unknown,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.mediaItem.update({
          where: { id: mediaItemId },
          data: { motifTemplateId: templateId, motifProvenance: provenance as object },
        });
        // One DETAIL link per person+media (@@unique on personId+mediaItemId+usage).
        const existing = await tx.personMediaLink.findFirst({
          where: { personId, mediaItemId, usage: "DETAIL" },
          select: { id: true },
        });
        if (existing) {
          await tx.personMediaLink.update({ where: { id: existing.id }, data: { categoryId } });
        } else {
          await tx.personMediaLink.create({ data: { personId, mediaItemId, usage: "DETAIL", categoryId } });
        }
      });
      revalidatePath(`/people/${personId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to assign aligned image" };
    }
  });
}

/** Lazily fetch a locus category's bound Alignment Template (for the Details-tab aligner). */
export async function getAlignmentTemplateForCategoryAction(
  categoryId: string,
): Promise<MotifTemplateRecord | null> {
  return withTenantFromHeaders(async () => getMotifTemplateForCategory(categoryId));
}

export async function createMotifTemplateAction(input: MotifTemplateInput): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await createMotifTemplate(input);
      revalidatePath(CATALOG_PATH);
      revalidatePath(MEDIA_CATALOG_PATH);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create template" };
    }
  });
}

export async function updateMotifTemplateAction(
  id: string,
  input: Partial<MotifTemplateInput>,
): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await updateMotifTemplate(id, input);
      revalidatePath(CATALOG_PATH);
      revalidatePath(MEDIA_CATALOG_PATH);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to update template" };
    }
  });
}

export async function deleteMotifTemplateAction(id: string): Promise<SimpleActionResult> {
  return withTenantFromHeaders(async () => {
    try {
      await deleteMotifTemplate(id);
      revalidatePath(CATALOG_PATH);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to delete template" };
    }
  });
}
