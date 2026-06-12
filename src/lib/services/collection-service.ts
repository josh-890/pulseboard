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
      _count: { select: { items: true } },
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
    },
    orderBy: { updatedAt: "desc" },
  });

  return collections.map((c) => {
    const firstItem = c.items[0]?.mediaItem;
    const variants = (firstItem?.variants as PhotoVariants) ?? {};
    const thumbKey = variants.gallery_512 ?? firstItem?.fileRef;

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      personId: c.personId,
      layout: c.layout as CollectionLayout,
      itemCount: c._count.items,
      thumbnailUrl: thumbKey ? buildUrl(thumbKey) : null,
      personName: c.person?.aliases[0]?.name ?? null,
    };
  });
}

export type CollectionSummaryLight = {
  id: string;
  name: string;
  personId: string | null;
};

export async function getAllCollectionsSummary(): Promise<CollectionSummaryLight[]> {
  const collections = await prisma.mediaCollection.findMany({
    select: { id: true, name: true, personId: true },
    orderBy: { name: "asc" },
  });
  return collections;
}

export async function getCollectionsForPerson(
  personId: string,
): Promise<CollectionSummary[]> {
  const collections = await prisma.mediaCollection.findMany({
    where: { personId },
    include: {
      _count: { select: { items: true } },
      items: {
        take: 1,
        orderBy: { sortOrder: "asc" },
        include: { mediaItem: { select: { variants: true, fileRef: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return collections.map((c) => {
    const firstItem = c.items[0]?.mediaItem;
    const variants = (firstItem?.variants as PhotoVariants) ?? {};
    const thumbKey = variants.gallery_512 ?? firstItem?.fileRef;

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      personId: c.personId,
      layout: c.layout as CollectionLayout,
      itemCount: c._count.items,
      thumbnailUrl: thumbKey ? buildUrl(thumbKey) : null,
      personName: null, // caller already has person context
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
