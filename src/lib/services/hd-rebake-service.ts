/**
 * HD re-bake worklist (ADR-0017). Computes which Aligned images can be refined
 * from their archive original, and the data the archive re-bake agent needs to
 * replay the alignment at full resolution. Read-only; eligibility resolution
 * lives here so the app count and the agent worklist agree.
 */
import { prisma } from "@/lib/db";

// Mirrors media-upload.ts: the master variant is the original fit inside a 4000px
// box. Legacy (v1) keypoints were clicked on that master, so we normalize against
// the master dims derived from the source's uploaded dimensions.
const MASTER_MAX_SIDE = 4000;

export type HdRebakeKeypoint = { x: number; y: number };

export type HdRebakeTemplate = {
  aspectW: number;
  aspectH: number;
  bakeLongSide: number;
  keypoints: unknown; // [{ name, x, y }] target fractions — passed through to the agent
  minSourcePx: number | null;
};

export type HdRebakeEntry = {
  /** The Aligned MediaItem to overwrite in place. */
  alignedMediaItemId: string;
  templateId: string;
  /** Archive folder + original filename of the source on the scanner host. */
  fullPath: string;
  filename: string;
  /** Keypoints as 0..1 source fractions (v1 pixel points normalized here). */
  keypoints: Record<string, HdRebakeKeypoint>;
  template: HdRebakeTemplate;
  /** Integrity check inputs: the source-origin's stored hash + uploaded dims. */
  sourceHash: string | null;
  sourceWidth: number;
  sourceHeight: number;
};

/**
 * Normalize bake provenance keypoints to 0..1 source fractions.
 * v2 provenance already stores fractions; v1 stores pixels on the master_4000,
 * normalized here using the master dims derived from `srcW`/`srcH`.
 */
export function normalizeKeypoints(
  provenance: unknown,
  srcW: number,
  srcH: number,
): Record<string, HdRebakeKeypoint> | null {
  if (!provenance || typeof provenance !== "object") return null;
  const p = provenance as Record<string, unknown>;

  if (p.version === 2 && p.keypoints && typeof p.keypoints === "object") {
    const kps = p.keypoints as Record<string, HdRebakeKeypoint>;
    return Object.keys(kps).length >= 2 ? kps : null;
  }

  const points = p.points as Record<string, HdRebakeKeypoint> | undefined;
  if (!points || typeof points !== "object") return null;
  const long = Math.max(srcW, srcH);
  if (long <= 0) return null;
  const scale = long > MASTER_MAX_SIDE ? MASTER_MAX_SIDE / long : 1;
  const masterW = srcW * scale;
  const masterH = srcH * scale;
  if (masterW <= 0 || masterH <= 0) return null;

  const out: Record<string, HdRebakeKeypoint> = {};
  for (const [name, pt] of Object.entries(points)) {
    if (typeof pt?.x !== "number" || typeof pt?.y !== "number") continue;
    out[name] = { x: pt.x / masterW, y: pt.y / masterH };
  }
  return Object.keys(out).length >= 2 ? out : null;
}

// Source lineage we need to reach the archive original (with one copy hop).
const SOURCE_SELECT = {
  id: true,
  filename: true,
  hash: true,
  originalWidth: true,
  originalHeight: true,
  copiedFromMediaItemId: true,
  setMediaItems: {
    select: {
      set: {
        select: {
          archiveLinks: {
            where: { status: "CONFIRMED" as const },
            select: { archiveFolder: { select: { fullPath: true, missingOnDisk: true } } },
          },
        },
      },
    },
  },
} as const;

type SourceRow = {
  id: string;
  filename: string;
  hash: string | null;
  originalWidth: number;
  originalHeight: number;
  copiedFromMediaItemId: string | null;
  setMediaItems: { set: { archiveLinks: { archiveFolder: { fullPath: string; missingOnDisk: boolean } }[] } }[];
};

/** First confirmed, on-disk archive folder this MediaItem traces to via a set. */
function archiveFolderOf(mi: SourceRow): { fullPath: string } | null {
  for (const smi of mi.setMediaItems) {
    for (const link of smi.set.archiveLinks) {
      if (!link.archiveFolder.missingOnDisk) return { fullPath: link.archiveFolder.fullPath };
    }
  }
  return null;
}

function sourceIdOf(provenance: unknown): string | null {
  if (!provenance || typeof provenance !== "object") return null;
  const v = (provenance as Record<string, unknown>).sourceMediaItemId;
  return typeof v === "string" ? v : null;
}

export type HdRebakeScope = { personId?: string; sessionId?: string };

export async function getHdRebakeWorklist(scope: HdRebakeScope = {}): Promise<HdRebakeEntry[]> {
  const aligneds = await prisma.mediaItem.findMany({
    where: {
      motifTemplateId: { not: null },
      bakeSource: "MASTER",
      ...(scope.sessionId ? { sessionId: scope.sessionId } : {}),
      ...(scope.personId ? { personMediaLinks: { some: { personId: scope.personId } } } : {}),
    },
    select: {
      id: true,
      motifTemplateId: true,
      motifProvenance: true,
      motifTemplate: {
        select: { aspectW: true, aspectH: true, bakeLongSide: true, keypoints: true, minSourcePx: true },
      },
    },
  });
  if (aligneds.length === 0) return [];

  const sourceIds = [...new Set(aligneds.map((a) => sourceIdOf(a.motifProvenance)).filter((s): s is string => !!s))];
  if (sourceIds.length === 0) return [];

  const sources = await prisma.mediaItem.findMany({ where: { id: { in: sourceIds } }, select: SOURCE_SELECT });
  const byId = new Map<string, SourceRow>(sources.map((s) => [s.id, s as SourceRow]));

  // One copy hop: reference copies of production photos carry the archive lineage
  // on the production original, not on the copy.
  const hopIds = [
    ...new Set(
      sources
        .filter((s) => !archiveFolderOf(s as SourceRow) && (s as SourceRow).copiedFromMediaItemId)
        .map((s) => (s as SourceRow).copiedFromMediaItemId as string),
    ),
  ];
  const parents = hopIds.length
    ? await prisma.mediaItem.findMany({ where: { id: { in: hopIds } }, select: SOURCE_SELECT })
    : [];
  const parentById = new Map<string, SourceRow>(parents.map((s) => [s.id, s as SourceRow]));

  const out: HdRebakeEntry[] = [];
  for (const a of aligneds) {
    if (!a.motifTemplate || !a.motifTemplateId) continue;
    const sourceId = sourceIdOf(a.motifProvenance);
    const source = sourceId ? byId.get(sourceId) : undefined;
    if (!source) continue;

    // Resolve the archive-backed origin (source itself, else its copy parent).
    let origin = archiveFolderOf(source) ? source : null;
    if (!origin && source.copiedFromMediaItemId) {
      const parent = parentById.get(source.copiedFromMediaItemId);
      if (parent && archiveFolderOf(parent)) origin = parent;
    }
    if (!origin) continue;
    const folder = archiveFolderOf(origin);
    if (!folder) continue;

    // Keypoints were clicked on the SOURCE master, so normalize against its dims.
    const keypoints = normalizeKeypoints(a.motifProvenance, source.originalWidth, source.originalHeight);
    if (!keypoints) continue;

    out.push({
      alignedMediaItemId: a.id,
      templateId: a.motifTemplateId,
      fullPath: folder.fullPath,
      filename: origin.filename,
      keypoints,
      template: {
        aspectW: a.motifTemplate.aspectW,
        aspectH: a.motifTemplate.aspectH,
        bakeLongSide: a.motifTemplate.bakeLongSide,
        keypoints: a.motifTemplate.keypoints,
        minSourcePx: a.motifTemplate.minSourcePx,
      },
      sourceHash: origin.hash,
      sourceWidth: origin.originalWidth,
      sourceHeight: origin.originalHeight,
    });
  }
  return out;
}

export async function getHdRebakeEligibleCount(scope: HdRebakeScope = {}): Promise<number> {
  return (await getHdRebakeWorklist(scope)).length;
}
