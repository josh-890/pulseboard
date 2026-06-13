/**
 * Comparison service (ADR-0015) — Comparisons are the members of a SIDE_BY_SIDE
 * collection: ordered groups of 2…N member photos. The aspect-driver member sets
 * the cell shape; fitMode (COVER/CONTAIN) + per-cell focal points control fill.
 */

import { prisma } from "@/lib/db";
import { buildUrl } from "@/lib/media-url";
import type { PhotoVariants } from "@/lib/types";

export type ComparisonFitMode = "COVER" | "CONTAIN";

function thumbUrl(variants: unknown, fileRef: string | null): string | null {
  const v = (variants ?? {}) as PhotoVariants;
  const key = v.gallery_512 ?? v.view_1200 ?? fileRef ?? null;
  return key ? buildUrl(key) : null;
}

function bestUrl(variants: unknown, fileRef: string | null): string | null {
  const v = (variants ?? {}) as PhotoVariants;
  const key = v.full_2400 ?? v.view_1200 ?? v.master_4000 ?? v.original ?? fileRef ?? null;
  return key ? buildUrl(key) : null;
}

export type ComparisonSummary = {
  id: string;
  title: string | null;
  sortOrder: number;
  fitMode: ComparisonFitMode;
  memberCount: number;
  members: { mediaItemId: string; thumbUrl: string | null }[];
};

export type ComparisonMember = {
  mediaItemId: string;
  sortOrder: number;
  focalX: number | null;
  focalY: number | null;
  isAspectDriver: boolean;
  originalWidth: number;
  originalHeight: number;
  thumbUrl: string | null;
  viewUrl: string | null;
};

export type ComparisonDetail = {
  id: string;
  collectionId: string;
  title: string | null;
  fitMode: ComparisonFitMode;
  aspectDriverMediaItemId: string | null;
  members: ComparisonMember[];
};

/** Comparisons of a collection, ordered, each with its ordered member thumbs (for the montage tile). */
export async function getComparisonsForCollection(collectionId: string): Promise<ComparisonSummary[]> {
  const comps = await prisma.comparison.findMany({
    where: { collectionId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { mediaItem: { select: { variants: true, fileRef: true } } },
      },
    },
  });
  return comps.map((c) => ({
    id: c.id,
    title: c.title,
    sortOrder: c.sortOrder,
    fitMode: c.fitMode as ComparisonFitMode,
    memberCount: c.items.length,
    members: c.items.map((it) => ({
      mediaItemId: it.mediaItemId,
      thumbUrl: thumbUrl(it.mediaItem.variants, it.mediaItem.fileRef),
    })),
  }));
}

export async function getComparisonDetail(comparisonId: string): Promise<ComparisonDetail | null> {
  const c = await prisma.comparison.findUnique({
    where: { id: comparisonId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { mediaItem: { select: { id: true, variants: true, fileRef: true, originalWidth: true, originalHeight: true } } },
      },
    },
  });
  if (!c) return null;
  const driverId = c.aspectDriverMediaItemId ?? c.items[0]?.mediaItemId ?? null;
  return {
    id: c.id,
    collectionId: c.collectionId,
    title: c.title,
    fitMode: c.fitMode as ComparisonFitMode,
    aspectDriverMediaItemId: driverId,
    members: c.items.map((it) => ({
      mediaItemId: it.mediaItemId,
      sortOrder: it.sortOrder,
      focalX: it.focalX,
      focalY: it.focalY,
      isAspectDriver: it.mediaItemId === driverId,
      originalWidth: it.mediaItem.originalWidth,
      originalHeight: it.mediaItem.originalHeight,
      thumbUrl: thumbUrl(it.mediaItem.variants, it.mediaItem.fileRef),
      viewUrl: bestUrl(it.mediaItem.variants, it.mediaItem.fileRef),
    })),
  };
}

/** Create a comparison in a collection from an ordered list of photos (aspect-driver = first). */
export async function createComparison(collectionId: string, mediaItemIds: string[]): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const max = await tx.comparison.aggregate({ where: { collectionId }, _max: { sortOrder: true } });
    const comparison = await tx.comparison.create({
      data: {
        collectionId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        aspectDriverMediaItemId: mediaItemIds[0] ?? null,
      },
    });
    if (mediaItemIds.length > 0) {
      await tx.comparisonItem.createMany({
        data: mediaItemIds.map((mediaItemId, i) => ({ comparisonId: comparison.id, mediaItemId, sortOrder: i })),
        skipDuplicates: true,
      });
    }
    return comparison.id;
  });
}

export async function deleteComparison(comparisonId: string): Promise<void> {
  // ComparisonItem cascades on the FK.
  await prisma.comparison.delete({ where: { id: comparisonId } });
}

export async function addComparisonItems(comparisonId: string, mediaItemIds: string[]): Promise<void> {
  if (mediaItemIds.length === 0) return;
  const max = await prisma.comparisonItem.aggregate({ where: { comparisonId }, _max: { sortOrder: true } });
  const start = (max._max.sortOrder ?? -1) + 1;
  await prisma.comparisonItem.createMany({
    data: mediaItemIds.map((mediaItemId, i) => ({ comparisonId, mediaItemId, sortOrder: start + i })),
    skipDuplicates: true,
  });
}

export async function removeComparisonItem(comparisonId: string, mediaItemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.comparisonItem.delete({ where: { comparisonId_mediaItemId: { comparisonId, mediaItemId } } });
    // If the removed member was the aspect-driver, fall back to null (⇒ first member).
    await tx.comparison.updateMany({
      where: { id: comparisonId, aspectDriverMediaItemId: mediaItemId },
      data: { aspectDriverMediaItemId: null },
    });
  });
}

export async function reorderComparisonItems(comparisonId: string, orderedMediaItemIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedMediaItemIds.map((mediaItemId, i) =>
      prisma.comparisonItem.update({
        where: { comparisonId_mediaItemId: { comparisonId, mediaItemId } },
        data: { sortOrder: i },
      }),
    ),
  );
}

export async function reorderComparisons(collectionId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.comparison.update({ where: { id }, data: { sortOrder: i } })),
  );
}

export async function setComparisonAspectDriver(comparisonId: string, mediaItemId: string | null): Promise<void> {
  await prisma.comparison.update({ where: { id: comparisonId }, data: { aspectDriverMediaItemId: mediaItemId } });
}

export async function setComparisonFitMode(comparisonId: string, fitMode: ComparisonFitMode): Promise<void> {
  await prisma.comparison.update({ where: { id: comparisonId }, data: { fitMode } });
}

export async function setComparisonTitle(comparisonId: string, title: string | null): Promise<void> {
  await prisma.comparison.update({ where: { id: comparisonId }, data: { title: title?.trim() || null } });
}

export async function setComparisonItemFocal(
  comparisonId: string,
  mediaItemId: string,
  focalX: number | null,
  focalY: number | null,
): Promise<void> {
  await prisma.comparisonItem.update({
    where: { comparisonId_mediaItemId: { comparisonId, mediaItemId } },
    data: {
      focalX: focalX === null ? null : Math.min(1, Math.max(0, focalX)),
      focalY: focalY === null ? null : Math.min(1, Math.max(0, focalY)),
    },
  });
}
