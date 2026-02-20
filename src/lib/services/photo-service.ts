import { prisma } from "@/lib/db";
import type { Photo as PrismaPhoto } from "@/generated/prisma/client";
import type { PhotoVariants, PhotoWithUrls } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

function buildUrl(key: string): string {
  return `${BASE_URL}/${key}`;
}

function toPhotoWithUrls(photo: PrismaPhoto): PhotoWithUrls {
  const variants = photo.variants as PhotoVariants;
  return {
    id: photo.id,
    entityType: photo.entityType as "person" | "set",
    entityId: photo.entityId,
    filename: photo.filename,
    mimeType: photo.mimeType,
    size: photo.size,
    originalWidth: photo.originalWidth,
    originalHeight: photo.originalHeight,
    variants,
    tags: photo.tags,
    linkedEntityType: photo.linkedEntityType,
    linkedEntityId: photo.linkedEntityId,
    caption: photo.caption,
    isFavorite: photo.isFavorite,
    sortOrder: photo.sortOrder,
    createdAt: photo.createdAt,
    deletedAt: photo.deletedAt,
    urls: {
      original: buildUrl(variants.original),
      profile_128: variants.profile_128 ? buildUrl(variants.profile_128) : null,
      profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
      profile_512: variants.profile_512 ? buildUrl(variants.profile_512) : null,
      profile_768: variants.profile_768 ? buildUrl(variants.profile_768) : null,
      gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
      gallery_1024: variants.gallery_1024 ? buildUrl(variants.gallery_1024) : null,
      gallery_1600: variants.gallery_1600 ? buildUrl(variants.gallery_1600) : null,
    },
  };
}

export async function getPhotosForEntity(
  entityType: "person" | "set",
  entityId: string,
): Promise<PhotoWithUrls[]> {
  const photos = await prisma.photo.findMany({
    where: { entityType, entityId },
    orderBy: { sortOrder: "asc" },
  });
  return photos.map(toPhotoWithUrls);
}

export async function getFavoritePhoto(
  entityType: "person" | "set",
  entityId: string,
): Promise<PhotoWithUrls | null> {
  const favorite = await prisma.photo.findFirst({
    where: { entityType, entityId, isFavorite: true },
  });
  if (favorite) return toPhotoWithUrls(favorite);

  const first = await prisma.photo.findFirst({
    where: { entityType, entityId },
    orderBy: { sortOrder: "asc" },
  });
  return first ? toPhotoWithUrls(first) : null;
}

export async function getFavoritePhotosForPersons(
  personIds: string[],
): Promise<Map<string, string>> {
  if (personIds.length === 0) return new Map();

  const photos = await prisma.photo.findMany({
    where: {
      entityType: "person",
      entityId: { in: personIds },
    },
    orderBy: [{ isFavorite: "desc" }, { sortOrder: "asc" }],
  });

  const result = new Map<string, string>();
  for (const p of photos) {
    if (!result.has(p.entityId)) {
      const variants = p.variants as PhotoVariants;
      const url = variants.profile_128
        ? buildUrl(variants.profile_128)
        : buildUrl(variants.original);
      result.set(p.entityId, url);
    }
  }

  return result;
}

export async function getFavoritePhotosForSets(
  setIds: string[],
): Promise<Map<string, string>> {
  if (setIds.length === 0) return new Map();

  const photos = await prisma.photo.findMany({
    where: {
      entityType: "set",
      entityId: { in: setIds },
    },
    orderBy: [{ isFavorite: "desc" }, { sortOrder: "asc" }],
  });

  const result = new Map<string, string>();
  for (const p of photos) {
    if (!result.has(p.entityId)) {
      const variants = p.variants as PhotoVariants;
      const url = variants.gallery_512
        ? buildUrl(variants.gallery_512)
        : buildUrl(variants.original);
      result.set(p.entityId, url);
    }
  }

  return result;
}

export async function getPhotoById(
  id: string,
): Promise<PhotoWithUrls | null> {
  const photo = await prisma.photo.findUnique({ where: { id } });
  return photo ? toPhotoWithUrls(photo) : null;
}

export async function createPhoto(data: {
  id: string;
  entityType: "person" | "set";
  entityId: string;
  filename: string;
  mimeType: string;
  size: number;
  originalWidth: number;
  originalHeight: number;
  variants: PhotoVariants;
  tags?: string[];
  caption?: string;
}): Promise<PhotoWithUrls> {
  const maxSort = await prisma.photo.aggregate({
    where: { entityType: data.entityType, entityId: data.entityId },
    _max: { sortOrder: true },
  });
  const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

  const photo = await prisma.photo.create({
    data: {
      id: data.id,
      entityType: data.entityType,
      entityId: data.entityId,
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
      originalWidth: data.originalWidth,
      originalHeight: data.originalHeight,
      variants: data.variants as unknown as Record<string, string>,
      tags: data.tags ?? [],
      caption: data.caption,
      sortOrder: nextSort,
    },
  });

  return toPhotoWithUrls(photo);
}

export async function setFavoritePhoto(
  photoId: string,
  entityType: "person" | "set",
  entityId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.photo.updateMany({
      where: { entityType, entityId, isFavorite: true },
      data: { isFavorite: false },
    });
    await tx.photo.update({
      where: { id: photoId },
      data: { isFavorite: true },
    });
  });
}

export async function reorderPhotos(
  entityType: "person" | "set",
  entityId: string,
  orderedIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.photo.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function deletePhoto(id: string): Promise<void> {
  await prisma.photo.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getPhotoCount(
  entityType: "person" | "set",
  entityId: string,
): Promise<number> {
  return prisma.photo.count({
    where: { entityType, entityId },
  });
}

export async function getPhotosByTags(
  entityType: "person" | "set",
  entityId: string,
  tags: string[],
): Promise<PhotoWithUrls[]> {
  const photos = await prisma.photo.findMany({
    where: {
      entityType,
      entityId,
      tags: { hasSome: tags },
    },
    orderBy: { sortOrder: "asc" },
  });
  return photos.map(toPhotoWithUrls);
}

const PROFILE_SLOT_TAGS = [
  "p-img01",
  "p-img02",
  "p-img03",
  "p-img04",
  "p-img05",
];

export async function updatePhotoTags(
  photoId: string,
  tags: string[],
  entityType?: "person" | "set",
  entityId?: string,
): Promise<PhotoWithUrls> {
  // If adding a profile slot tag, enforce one-image-per-slot
  const profileSlots = tags.filter((t) => PROFILE_SLOT_TAGS.includes(t));
  if (profileSlots.length > 0 && entityType && entityId) {
    await prisma.$transaction(async (tx) => {
      for (const slot of profileSlots) {
        // Remove the slot tag from any other photo of this entity
        const others = await tx.photo.findMany({
          where: {
            entityType,
            entityId,
            id: { not: photoId },
            tags: { has: slot },
          },
        });
        for (const other of others) {
          await tx.photo.update({
            where: { id: other.id },
            data: { tags: other.tags.filter((t) => t !== slot) },
          });
        }
      }
      await tx.photo.update({
        where: { id: photoId },
        data: { tags },
      });
    });
    const updated = await prisma.photo.findUniqueOrThrow({
      where: { id: photoId },
    });
    return toPhotoWithUrls(updated);
  }

  const photo = await prisma.photo.update({
    where: { id: photoId },
    data: { tags },
  });
  return toPhotoWithUrls(photo);
}

export async function assignProfileSlot(
  photoId: string,
  entityType: "person" | "set",
  entityId: string,
  slot: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Remove the slot tag from any other photo of this entity
    const others = await tx.photo.findMany({
      where: {
        entityType,
        entityId,
        id: { not: photoId },
        tags: { has: slot },
      },
    });
    for (const other of others) {
      await tx.photo.update({
        where: { id: other.id },
        data: { tags: other.tags.filter((t) => t !== slot) },
      });
    }

    // Add the slot tag to the target photo
    const target = await tx.photo.findUniqueOrThrow({
      where: { id: photoId },
    });
    const newTags = target.tags.includes(slot)
      ? target.tags
      : [...target.tags, slot];
    await tx.photo.update({
      where: { id: photoId },
      data: { tags: newTags },
    });
  });
}
