import { prisma } from "@/lib/db";
import type { GalleryItem, PhotoVariants } from "@/lib/types";
import { buildUrl } from "@/lib/media-url";
import { mapMediaItemToGalleryItem } from "@/lib/services/media-service";

export type CollectionLayout = "GRID" | "SIDE_BY_SIDE";

export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  personId: string | null;
  layout: CollectionLayout;
  itemCount: number;
  thumbnailUrl: string | null;
  personName: string | null;
  // Landing-page refresh (ADR-0019 follow-up): sort + target-pin support.
  isTarget: boolean;
  createdAt: Date;
  updatedAt: Date;
};


export async function getAllCollections(filters: {
  personId?: string | null;
  globalOnly?: boolean;
} = {}): Promise<CollectionSummary[]> {
  const where: { personId?: string | null } = {};

  if (filters.globalOnly) {
    where.personId = null;
  } else if (filters.personId) {
    where.personId = filters.personId;
  }

  const collections = await prisma.mediaCollection.findMany({
    where,
    include: {
      _count: { select: { items: true, comparisons: true } },
      person: {
        select: {
          aliases: { where: { isCommon: true }, take: 1 },
        },
      },
      items: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        include: { mediaItem: { select: { variants: true, fileRef: true } } },
      },
      // SIDE_BY_SIDE collections hold no loose items — derive cover + count from
      // their first comparison's first member.
      comparisons: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            take: 1,
            orderBy: { sortOrder: "asc" },
            include: { mediaItem: { select: { variants: true, fileRef: true } } },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return collections.map((c) => {
    const isSxs = c.layout === "SIDE_BY_SIDE";
    const firstItem = isSxs ? c.comparisons[0]?.items[0]?.mediaItem : c.items[0]?.mediaItem;
    const variants = (firstItem?.variants as PhotoVariants) ?? {};
    const thumbKey = variants.gallery_512 ?? firstItem?.fileRef;

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      personId: c.personId,
      layout: c.layout as CollectionLayout,
      itemCount: isSxs ? c._count.comparisons : c._count.items,
      thumbnailUrl: thumbKey ? buildUrl(thumbKey) : null,
      personName: c.person?.aliases[0]?.name ?? null,
      isTarget: c.isTarget,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  });
}

export type CollectionSummaryLight = {
  id: string;
  name: string;
  personId: string | null;
  layout: CollectionLayout;
};

export async function getAllCollectionsSummary(): Promise<CollectionSummaryLight[]> {
  const collections = await prisma.mediaCollection.findMany({
    select: { id: true, name: true, personId: true, layout: true },
    orderBy: { name: "asc" },
  });
  return collections.map((c) => ({ ...c, layout: c.layout as CollectionLayout }));
}

export async function getCollectionsForPerson(
  personId: string,
): Promise<CollectionSummary[]> {
  const collections = await prisma.mediaCollection.findMany({
    where: { personId },
    include: {
      _count: { select: { items: true, comparisons: true } },
      items: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        include: { mediaItem: { select: { variants: true, fileRef: true } } },
      },
      comparisons: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            take: 1,
            orderBy: { sortOrder: "asc" },
            include: { mediaItem: { select: { variants: true, fileRef: true } } },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return collections.map((c) => {
    const isSxs = c.layout === "SIDE_BY_SIDE";
    const firstItem = isSxs ? c.comparisons[0]?.items[0]?.mediaItem : c.items[0]?.mediaItem;
    const variants = (firstItem?.variants as PhotoVariants) ?? {};
    const thumbKey = variants.gallery_512 ?? firstItem?.fileRef;

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      personId: c.personId,
      layout: c.layout as CollectionLayout,
      itemCount: isSxs ? c._count.comparisons : c._count.items,
      thumbnailUrl: thumbKey ? buildUrl(thumbKey) : null,
      personName: null, // caller already has person context
      isTarget: c.isTarget,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  });
}

export async function getCollectionWithItems(collectionId: string) {
  return prisma.mediaCollection.findUnique({
    where: { id: collectionId },
    include: {
      person: {
        select: {
          id: true,
          aliases: { where: { isCommon: true }, take: 1 },
        },
      },
      items: {
        include: {
          mediaItem: {
            include: {
              session: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function getCollectionGalleryItems(collectionId: string): Promise<GalleryItem[]> {
  const items = await prisma.mediaCollectionItem.findMany({
    where: { collectionId },
    include: {
      mediaItem: {
        include: {
          collectionItems: { select: { collectionId: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  // Phase 3: mapper produces the base; sortOrder comes from the
  // MediaCollectionItem bridge (the canonical mapper doesn't know about
  // collection bridges — same pattern as SetMediaItem).
  const results: GalleryItem[] = [];
  for (const ci of items) {
    const base = mapMediaItemToGalleryItem(ci.mediaItem);
    if (!base) continue;
    results.push({ ...base, sortOrder: ci.sortOrder });
  }
  return results;
}

export async function createCollection(data: {
  name: string;
  description?: string;
  personId?: string;
  layout?: CollectionLayout;
}): Promise<string> {
  const collection = await prisma.mediaCollection.create({
    data: {
      name: data.name,
      description: data.description,
      personId: data.personId,
      ...(data.layout ? { layout: data.layout } : {}),
    },
  });
  return collection.id;
}

export async function updateCollection(
  id: string,
  data: { name?: string; description?: string; layout?: CollectionLayout },
): Promise<void> {
  await prisma.mediaCollection.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.layout !== undefined ? { layout: data.layout } : {}),
    },
  });
}

export async function deleteCollection(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mediaCollectionItem.deleteMany({ where: { collectionId: id } });
    await tx.mediaCollection.delete({ where: { id } });
  });
}

export async function addToCollection(
  collectionId: string,
  mediaItemIds: string[],
): Promise<void> {
  if (mediaItemIds.length === 0) return;

  // Get current max sortOrder
  const maxSort = await prisma.mediaCollectionItem.aggregate({
    where: { collectionId },
    _max: { sortOrder: true },
  });
  const startOrder = (maxSort._max.sortOrder ?? -1) + 1;

  await prisma.mediaCollectionItem.createMany({
    data: mediaItemIds.map((mediaItemId, i) => ({
      collectionId,
      mediaItemId,
      sortOrder: startOrder + i,
    })),
    skipDuplicates: true,
  });
}

export async function removeFromCollection(
  collectionId: string,
  mediaItemIds: string[],
): Promise<void> {
  if (mediaItemIds.length === 0) return;

  await prisma.mediaCollectionItem.deleteMany({
    where: {
      collectionId,
      mediaItemId: { in: mediaItemIds },
    },
  });
}

/** Rewrite item order to match the given mediaItemId sequence (0..n sortOrder). */
export async function reorderCollection(
  collectionId: string,
  orderedMediaItemIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedMediaItemIds.map((mediaItemId, i) =>
      prisma.mediaCollectionItem.update({
        where: { collectionId_mediaItemId: { collectionId, mediaItemId } },
        data: { sortOrder: i },
      }),
    ),
  );
}

export async function getCollectionIdsForMediaItems(
  mediaItemIds: string[],
): Promise<Map<string, string[]>> {
  if (mediaItemIds.length === 0) return new Map();

  const links = await prisma.mediaCollectionItem.findMany({
    where: { mediaItemId: { in: mediaItemIds } },
    select: { mediaItemId: true, collectionId: true },
  });

  const map = new Map<string, string[]>();
  for (const link of links) {
    const existing = map.get(link.mediaItemId) ?? [];
    existing.push(link.collectionId);
    map.set(link.mediaItemId, existing);
  }
  return map;
}

// ─── Favorites + target collection (ADR-0019) ────────────────────────────────

// Mark every member of a collection as a global favorite (used to retire a
// hand-made "FAV" collection). Returns the number of items converted.
export async function convertCollectionToFavorites(collectionId: string): Promise<number> {
  const items = await prisma.mediaCollectionItem.findMany({
    where: { collectionId },
    select: { mediaItemId: true },
  });
  const ids = items.map((i) => i.mediaItemId);
  if (ids.length === 0) return 0;
  await prisma.mediaItem.updateMany({
    where: { id: { in: ids } },
    data: { isFavorite: true },
  });
  return ids.length;
}

// The single "target" collection for one-key quick-add (Lightroom-style).
export async function getTargetCollection(): Promise<{ id: string; name: string } | null> {
  return prisma.mediaCollection.findFirst({
    where: { isTarget: true },
    select: { id: true, name: true },
  });
}

// Set (or clear) the target collection — enforces at most one TRUE.
export async function setTargetCollection(collectionId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mediaCollection.updateMany({
      where: { isTarget: true },
      data: { isTarget: false },
    });
    if (collectionId) {
      await tx.mediaCollection.update({
        where: { id: collectionId },
        data: { isTarget: true },
      });
    }
  });
}

// GRID collections for the quick-add palette (excludes SIDE_BY_SIDE comparison
// containers), with the target flagged.
export async function getGridCollectionsForPalette(): Promise<
  { id: string; name: string; isTarget: boolean }[]
> {
  return prisma.mediaCollection.findMany({
    where: { layout: "GRID" },
    select: { id: true, name: true, isTarget: true },
    orderBy: { name: "asc" },
  });
}
