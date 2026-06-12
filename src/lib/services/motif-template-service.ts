/**
 * Motif Template service — definitions of "standardized motifs" per profile slot.
 * A template fixes the output geometry + the target keypoint positions an aligned
 * image must hit, so a motif (e.g. headshot eye-line/zoom) is framed identically
 * across people. Authored in the Motif Templates catalog, consumed by the aligner.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export type MotifKeypoint = {
  /** Stable identifier the aligner asks the user to click (e.g. "left_eye"). */
  name: string;
  /** Target position as a fraction (0..1) of the output frame. */
  x: number;
  y: number;
};

/** Editor-underlay transform for the pinned silhouette reference image. */
export type SilhouetteTransform = {
  /** Pan as a fraction of the canvas box dims (resolution-independent). */
  offsetXFrac: number;
  offsetYFrac: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
};

export type MotifTemplateRecord = {
  id: string;
  name: string;
  /** Profile slot (1..N) for legacy headshot templates; null for category-bound. */
  slot: number | null;
  /** Bound locus MediaCategory (ADR-0014); null for profile-slot templates. */
  categoryId: string | null;
  categoryName: string | null;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: MotifKeypoint[];
  silhouetteRef: string | null;
  silhouetteTransform: SilhouetteTransform | null;
  minSourcePx: number | null;
};

function parseSilhouetteTransform(value: unknown): SilhouetteTransform | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
  return {
    offsetXFrac: num(v.offsetXFrac, 0),
    offsetYFrac: num(v.offsetYFrac, 0),
    scale: num(v.scale, 1),
    rotationDeg: num(v.rotationDeg, 0),
    opacity: num(v.opacity, 0.3),
  };
}

function parseKeypoints(value: unknown): MotifKeypoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((k) =>
    k && typeof k === "object" && typeof (k as MotifKeypoint).name === "string"
      ? [{ name: String((k as MotifKeypoint).name), x: Number((k as MotifKeypoint).x), y: Number((k as MotifKeypoint).y) }]
      : [],
  );
}

type Row = {
  id: string;
  name: string;
  slot: number | null;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: unknown;
  silhouetteRef: string | null;
  silhouetteTransform: unknown;
  minSourcePx: number | null;
  category: { id: string; name: string } | null;
};

function toRecord(r: Row): MotifTemplateRecord {
  return {
    id: r.id,
    name: r.name,
    slot: r.slot,
    categoryId: r.category?.id ?? null,
    categoryName: r.category?.name ?? null,
    aspectW: r.aspectW,
    aspectH: r.aspectH,
    bakeLongSide: r.bakeLongSide,
    keypoints: parseKeypoints(r.keypoints),
    silhouetteRef: r.silhouetteRef,
    silhouetteTransform: parseSilhouetteTransform(r.silhouetteTransform),
    minSourcePx: r.minSourcePx,
  };
}

const SELECT = {
  id: true,
  name: true,
  slot: true,
  aspectW: true,
  aspectH: true,
  bakeLongSide: true,
  keypoints: true,
  silhouetteRef: true,
  silhouetteTransform: true,
  minSourcePx: true,
  category: { select: { id: true, name: true } },
} as const;

export async function getMotifTemplates(): Promise<MotifTemplateRecord[]> {
  // Slot templates first (slot asc), then category-bound (slot null) by name.
  const rows = await prisma.motifTemplate.findMany({
    select: SELECT,
    orderBy: [{ slot: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  return rows.map(toRecord);
}

export async function getMotifTemplateForSlot(slot: number): Promise<MotifTemplateRecord | null> {
  const row = await prisma.motifTemplate.findUnique({ where: { slot }, select: SELECT });
  return row ? toRecord(row) : null;
}

export async function getMotifTemplateById(id: string): Promise<MotifTemplateRecord | null> {
  const row = await prisma.motifTemplate.findUnique({ where: { id }, select: SELECT });
  return row ? toRecord(row) : null;
}

/** The Alignment Template bound to a locus category, if any (ADR-0014). */
export async function getMotifTemplateForCategory(categoryId: string): Promise<MotifTemplateRecord | null> {
  const row = await prisma.motifTemplate.findFirst({ where: { category: { id: categoryId } }, select: SELECT });
  return row ? toRecord(row) : null;
}

export type MotifTemplateInput = {
  name: string;
  /** Profile-slot binding. Mutually exclusive with categoryId; null for category templates. */
  slot?: number | null;
  /** Locus-category binding (ADR-0014). Mutually exclusive with slot. */
  categoryId?: string | null;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: MotifKeypoint[];
  silhouetteRef?: string | null;
  silhouetteTransform?: SilhouetteTransform | null;
  minSourcePx?: number | null;
};

/**
 * Bind a template to a locus category (or unbind when categoryId is null).
 * The FK lives on MediaCategory (@unique), so first clear any category pointing
 * at this template, then point the target category at it — replacing whatever
 * template that category previously held (the displaced one becomes unbound).
 */
async function applyCategoryBinding(
  tx: Prisma.TransactionClient,
  templateId: string,
  categoryId: string | null,
): Promise<void> {
  await tx.mediaCategory.updateMany({ where: { alignmentTemplateId: templateId }, data: { alignmentTemplateId: null } });
  if (categoryId) {
    await tx.mediaCategory.update({ where: { id: categoryId }, data: { alignmentTemplateId: templateId } });
  }
}

export async function createMotifTemplate(input: MotifTemplateInput): Promise<MotifTemplateRecord> {
  // A category-bound template has no slot (slot XOR category).
  const slot = input.categoryId ? null : input.slot ?? null;
  return prisma.$transaction(async (tx) => {
    const created = await tx.motifTemplate.create({
      data: {
        name: input.name,
        slot,
        aspectW: input.aspectW,
        aspectH: input.aspectH,
        bakeLongSide: input.bakeLongSide,
        keypoints: input.keypoints,
        silhouetteRef: input.silhouetteRef ?? null,
        silhouetteTransform: input.silhouetteTransform ?? undefined,
        minSourcePx: input.minSourcePx ?? null,
      },
      select: { id: true },
    });
    if (input.categoryId !== undefined) await applyCategoryBinding(tx, created.id, input.categoryId ?? null);
    const row = await tx.motifTemplate.findUniqueOrThrow({ where: { id: created.id }, select: SELECT });
    return toRecord(row);
  });
}

export async function updateMotifTemplate(id: string, input: Partial<MotifTemplateInput>): Promise<MotifTemplateRecord> {
  const wantsBindingChange = input.slot !== undefined || input.categoryId !== undefined;
  const slotValue = input.categoryId ? null : input.slot ?? null;
  return prisma.$transaction(async (tx) => {
    await tx.motifTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(wantsBindingChange ? { slot: slotValue } : {}),
        ...(input.aspectW !== undefined ? { aspectW: input.aspectW } : {}),
        ...(input.aspectH !== undefined ? { aspectH: input.aspectH } : {}),
        ...(input.bakeLongSide !== undefined ? { bakeLongSide: input.bakeLongSide } : {}),
        ...(input.keypoints !== undefined ? { keypoints: input.keypoints } : {}),
        ...(input.silhouetteRef !== undefined ? { silhouetteRef: input.silhouetteRef } : {}),
        ...(input.silhouetteTransform !== undefined
          ? { silhouetteTransform: input.silhouetteTransform === null ? Prisma.DbNull : input.silhouetteTransform }
          : {}),
        ...(input.minSourcePx !== undefined ? { minSourcePx: input.minSourcePx } : {}),
      },
    });
    if (input.categoryId !== undefined) await applyCategoryBinding(tx, id, input.categoryId ?? null);
    const row = await tx.motifTemplate.findUniqueOrThrow({ where: { id }, select: SELECT });
    return toRecord(row);
  });
}

export async function deleteMotifTemplate(id: string): Promise<void> {
  await prisma.motifTemplate.delete({ where: { id } });
}
