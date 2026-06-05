/**
 * Motif Template service — definitions of "standardized motifs" per profile slot.
 * A template fixes the output geometry + the target keypoint positions an aligned
 * image must hit, so a motif (e.g. headshot eye-line/zoom) is framed identically
 * across people. Authored in the Motif Templates catalog, consumed by the aligner.
 */

import { prisma } from "@/lib/db";

export type MotifKeypoint = {
  /** Stable identifier the aligner asks the user to click (e.g. "left_eye"). */
  name: string;
  /** Target position as a fraction (0..1) of the output frame. */
  x: number;
  y: number;
};

export type MotifTemplateRecord = {
  id: string;
  name: string;
  slot: number;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: MotifKeypoint[];
  silhouetteRef: string | null;
  minSourcePx: number | null;
};

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
  slot: number;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: unknown;
  silhouetteRef: string | null;
  minSourcePx: number | null;
};

function toRecord(r: Row): MotifTemplateRecord {
  return {
    id: r.id,
    name: r.name,
    slot: r.slot,
    aspectW: r.aspectW,
    aspectH: r.aspectH,
    bakeLongSide: r.bakeLongSide,
    keypoints: parseKeypoints(r.keypoints),
    silhouetteRef: r.silhouetteRef,
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
  minSourcePx: true,
} as const;

export async function getMotifTemplates(): Promise<MotifTemplateRecord[]> {
  const rows = await prisma.motifTemplate.findMany({ select: SELECT, orderBy: { slot: "asc" } });
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

export type MotifTemplateInput = {
  name: string;
  slot: number;
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: MotifKeypoint[];
  silhouetteRef?: string | null;
  minSourcePx?: number | null;
};

export async function createMotifTemplate(input: MotifTemplateInput): Promise<MotifTemplateRecord> {
  const row = await prisma.motifTemplate.create({
    data: {
      name: input.name,
      slot: input.slot,
      aspectW: input.aspectW,
      aspectH: input.aspectH,
      bakeLongSide: input.bakeLongSide,
      keypoints: input.keypoints,
      silhouetteRef: input.silhouetteRef ?? null,
      minSourcePx: input.minSourcePx ?? null,
    },
    select: SELECT,
  });
  return toRecord(row);
}

export async function updateMotifTemplate(id: string, input: Partial<MotifTemplateInput>): Promise<MotifTemplateRecord> {
  const row = await prisma.motifTemplate.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slot !== undefined ? { slot: input.slot } : {}),
      ...(input.aspectW !== undefined ? { aspectW: input.aspectW } : {}),
      ...(input.aspectH !== undefined ? { aspectH: input.aspectH } : {}),
      ...(input.bakeLongSide !== undefined ? { bakeLongSide: input.bakeLongSide } : {}),
      ...(input.keypoints !== undefined ? { keypoints: input.keypoints } : {}),
      ...(input.silhouetteRef !== undefined ? { silhouetteRef: input.silhouetteRef } : {}),
      ...(input.minSourcePx !== undefined ? { minSourcePx: input.minSourcePx } : {}),
    },
    select: SELECT,
  });
  return toRecord(row);
}

export async function deleteMotifTemplate(id: string): Promise<void> {
  await prisma.motifTemplate.delete({ where: { id } });
}
