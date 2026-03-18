import { prisma } from "@/lib/db";
import type { GalleryItem } from "@/lib/types";
import type { PhotoUrls } from "@/lib/types";

export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  personId: string | null;
  itemCount: number;
  thumbnailUrl: string | null;
  personName: string | null;
};

import { buildUrl } from "@/lib/media-url";

type PhotoVariants = Record<string, string | undefined>;

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
          aliases: { where: { type: "common" }, take: 1 },
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
          aliases: { where: { type: "common" }, take: 1 },
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

  return items
    .map((ci) => {
      const m = ci.mediaItem;
      const variants = (m.variants as PhotoVariants) ?? {};
      const urls: PhotoUrls = {
        original: variants.original ? buildUrl(variants.original) : m.fileRef ? buildUrl(m.fileRef) : "",
        profile_128: variants.profile_128 ? buildUrl(variants.profile_128) : null,
        profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
        profile_512: variants.profile_512 ? buildUrl(variants.profile_512) : null,
        profile_768: variants.profile_768 ? buildUrl(variants.profile_768) : null,
        gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
        gallery_1024: variants.gallery_1024 ? buildUrl(variants.gallery_1024) : null,
        gallery_1600: variants.gallery_1600 ? buildUrl(variants.gallery_1600) : null,
      };

      return {
        id: m.id,
        filename: m.filename,
        mimeType: m.mimeType,
        originalWidth: m.originalWidth,
        originalHeight: m.originalHeight,
        caption: m.caption,
        createdAt: m.createdAt,
        urls,
        focalX: m.focalX,
        focalY: m.focalY,
        tags: m.tags,
        isFavorite: false,
        sortOrder: ci.sortOrder,
        isCover: false,
        collectionIds: m.collectionItems.map((ci2) => ci2.collectionId),
      };
    });
}

export async function createCollection(data: {
  name: string;
  description?: string;
  personId?: string;
}): Promise<string> {
  const collection = await prisma.mediaCollection.create({
    data: {
      name: data.name,
      description: data.description,
      personId: data.personId,
    },
  });
  return collection.id;
}

export async function updateCollection(
  id: string,
  data: { name?: string; description?: string },
): Promise<void> {
  await prisma.mediaCollection.update({
    where: { id },
    data,
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
