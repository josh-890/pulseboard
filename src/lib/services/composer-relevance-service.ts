import { prisma } from "@/lib/db";
import type { RelevanceLevel } from "@/lib/composer";

// Context relevance (ADR-0043): one cell of the matrix — how relevant a path, a
// facet (tag group) or a value (tag) is when a context tag is on the photo.
// `null` clears the cell, so it inherits again (value → facet → path → possible).

export type RelevanceTargetKind = "PATH" | "GROUP" | "TAG";

export async function setRelevance(
  contextTagId: string,
  targetKind: RelevanceTargetKind,
  targetId: string,
  level: RelevanceLevel | null,
): Promise<void> {
  const where = { contextTagId_targetKind_targetId: { contextTagId, targetKind, targetId } };
  if (level === null) {
    await prisma.tagRelevance.deleteMany({ where: { contextTagId, targetKind, targetId } });
    return;
  }
  await prisma.tagRelevance.upsert({ where, create: { contextTagId, targetKind, targetId, level }, update: { level } });
}

/** Every relevance row, for the matrix */
export async function getRelevanceRows() {
  return prisma.tagRelevance.findMany({ select: { contextTagId: true, targetKind: true, targetId: true, level: true } });
}
