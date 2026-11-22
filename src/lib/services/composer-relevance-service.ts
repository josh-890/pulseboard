import { prisma } from "@/lib/db";
import type { RelevanceLevel } from "@/lib/composer";

// Context relevance (ADR-0043): one cell of the matrix — how relevant a path, a
// facet (tag group) or a value (tag) is when a context tag is on the photo.
// `null` clears the cell, so it inherits again (value → facet → path → possible).

export type RelevanceTargetKind = "PATH" | "GROUP" | "TAG";

const LEVELS: RelevanceLevel[] = ["TYPICAL", "POSSIBLE", "IMPOSSIBLE"];

/** The context is a tag; the target is a path, a facet or a value that exists */
async function assertTargets(contextTagId: string, targetKind: RelevanceTargetKind, targetId: string): Promise<void> {
  const context = await prisma.tagDefinition.count({ where: { id: contextTagId } });
  if (!context) throw new Error("Unknown context tag");
  const n =
    targetKind === "PATH"
      ? await prisma.composerPath.count({ where: { id: targetId } })
      : targetKind === "GROUP"
        ? await prisma.tagGroup.count({ where: { id: targetId } })
        : targetKind === "TAG"
          ? await prisma.tagDefinition.count({ where: { id: targetId } })
          : 0;
  if (!n) throw new Error("Unknown relevance target");
}

export async function setRelevance(
  contextTagId: string,
  targetKind: RelevanceTargetKind,
  targetId: string,
  level: RelevanceLevel | null,
): Promise<void> {
  const where = { contextTagId_targetKind_targetId: { contextTagId, targetKind, targetId } };
  if (level !== null && !LEVELS.includes(level)) throw new Error(`Unknown level "${level}"`);
  if (level !== null) await assertTargets(contextTagId, targetKind, targetId);
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
