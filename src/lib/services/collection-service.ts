import { prisma } from "@/lib/db";

export type CollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  itemCount: number;
};

export async function getCollectionsForPerson(
  personId: string,
): Promise<CollectionSummary[]> {
  const collections = await prisma.mediaCollection.findMany({
    where: { personId },
    include: { _count: { select: { items: true } } },
    orderBy: { name: "asc" },
  });

  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    itemCount: c._count.items,
  }));
}

export async function getCollectionWithItems(collectionId: string) {
  return prisma.mediaCollection.findUnique({
    where: { id: collectionId },
    include: {
      items: {
        include: { mediaItem: true },
        orderBy: { sortOrder: "asc" },
      },
    },
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
  await prisma.mediaCollection.update({
    where: { id },
    data: { deletedAt: new Date() },
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
