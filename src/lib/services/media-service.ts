import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { PhotoVariants, PhotoUrls } from "@/lib/types";
import type { MediaItemWithUrls, PersonMediaUsage } from "@/lib/types";

const BASE_URL = process.env.NEXT_PUBLIC_MINIO_URL!;

function buildUrl(key: string): string {
  return `${BASE_URL}/${key}`;
}

function buildPhotoUrls(variants: PhotoVariants, fileRef?: string | null): PhotoUrls {
  const originalUrl = variants.original
    ? buildUrl(variants.original)
    : fileRef
      ? buildUrl(fileRef)
      : "";
  return {
    original: originalUrl,
    profile_128: variants.profile_128 ? buildUrl(variants.profile_128) : null,
    profile_256: variants.profile_256 ? buildUrl(variants.profile_256) : null,
    profile_512: variants.profile_512 ? buildUrl(variants.profile_512) : null,
    profile_768: variants.profile_768 ? buildUrl(variants.profile_768) : null,
    gallery_512: variants.gallery_512 ? buildUrl(variants.gallery_512) : null,
    gallery_1024: variants.gallery_1024 ? buildUrl(variants.gallery_1024) : null,
    gallery_1600: variants.gallery_1600 ? buildUrl(variants.gallery_1600) : null,
  };
}

type MediaItemRow = {
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  caption: string | null;
  createdAt: Date;
  variants: unknown;
  fileRef?: string | null;
};

function toMediaItemWithUrls(item: MediaItemRow): MediaItemWithUrls | null {
  const variants = (item.variants ?? {}) as PhotoVariants;
  if (!variants.original && !item.fileRef) return null;
  return {
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    originalWidth: item.originalWidth,
    originalHeight: item.originalHeight,
    caption: item.caption,
    createdAt: item.createdAt,
    urls: buildPhotoUrls(variants, item.fileRef),
  };
}

// ─── Set bridge (existing) ───────────────────────────────────────────────────

type CreateMediaItemInput = {
  sessionId: string;
  setId: string;
  filename: string;
  mimeType: string;
  size: number;
  originalWidth: number;
  originalHeight: number;
  variants: PhotoVariants;
  caption?: string;
  tags?: string[];
};

export async function createMediaItemFromPhoto(
  input: CreateMediaItemInput,
): Promise<string> {
  const mediaItemId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.create({
      data: {
        id: mediaItemId,
        sessionId: input.sessionId,
        mediaType: "PHOTO",
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        originalWidth: input.originalWidth,
        originalHeight: input.originalHeight,
        variants: input.variants as unknown as Record<string, string>,
        caption: input.caption,
        tags: input.tags ?? [],
      },
    });

    await tx.setMediaItem.create({
      data: {
        setId: input.setId,
        mediaItemId,
      },
    });
  });

  return mediaItemId;
}

// ─── Person bridge (new) ─────────────────────────────────────────────────────

type CreatePersonMediaItemInput = {
  sessionId: string;
  personId: string;
  filename: string;
  mimeType: string;
  size: number;
  originalWidth: number;
  originalHeight: number;
  variants: PhotoVariants;
  caption?: string;
  tags?: string[];
  usage?: PersonMediaUsage;
  slot?: number;
  bodyRegion?: string;
  bodyMarkId?: string;
  bodyModificationId?: string;
  cosmeticProcedureId?: string;
};

function inferUsageFromTags(tags?: string[]): PersonMediaUsage {
  if (!tags || tags.length === 0) return "REFERENCE";
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  if (tagSet.has("portrait") || tagSet.has("headshot")) return "HEADSHOT";
  if (tagSet.has("tattoo") || tagSet.has("body_mark")) return "BODY_MARK";
  if (tagSet.has("body_modification") || tagSet.has("piercing")) return "BODY_MODIFICATION";
  if (tagSet.has("cosmetic_procedure")) return "COSMETIC_PROCEDURE";
  if (tagSet.has("profile")) return "PROFILE";
  if (tagSet.has("portfolio")) return "PORTFOLIO";
  return "REFERENCE";
}

export async function createMediaItemForPerson(
  input: CreatePersonMediaItemInput,
): Promise<string> {
  const mediaItemId = randomUUID();
  const usage = input.usage ?? inferUsageFromTags(input.tags);

  await prisma.$transaction(async (tx) => {
    await tx.mediaItem.create({
      data: {
        id: mediaItemId,
        sessionId: input.sessionId,
        mediaType: "PHOTO",
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        originalWidth: input.originalWidth,
        originalHeight: input.originalHeight,
        variants: input.variants as unknown as Record<string, string>,
        caption: input.caption,
        tags: input.tags ?? [],
      },
    });

    await tx.personMediaLink.create({
      data: {
        personId: input.personId,
        mediaItemId,
        usage,
        slot: input.slot,
        bodyRegion: input.bodyRegion,
        bodyMarkId: input.bodyMarkId,
        bodyModificationId: input.bodyModificationId,
        cosmeticProcedureId: input.cosmeticProcedureId,
      },
    });
  });

  return mediaItemId;
}

// ─── Query functions ─────────────────────────────────────────────────────────

export async function getMediaItemsForSession(
  sessionId: string,
): Promise<MediaItemWithUrls[]> {
  const items = await prisma.mediaItem.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  return items
    .map((item) => toMediaItemWithUrls(item))
    .filter((item): item is MediaItemWithUrls => item !== null);
}

export type PersonMediaLinkWithItem = {
  id: string;
  usage: PersonMediaUsage;
  slot: number | null;
  bodyRegion: string | null;
  bodyMarkId: string | null;
  bodyModificationId: string | null;
  cosmeticProcedureId: string | null;
  isFavorite: boolean;
  sortOrder: number;
  notes: string | null;
  mediaItem: MediaItemWithUrls;
};

function toPersonMediaLinkWithItem(
  link: {
    id: string;
    usage: PersonMediaUsage;
    slot: number | null;
    bodyRegion: string | null;
    bodyMarkId: string | null;
    bodyModificationId: string | null;
    cosmeticProcedureId: string | null;
    isFavorite: boolean;
    sortOrder: number;
    notes: string | null;
    mediaItem: MediaItemRow & { fileRef: string | null };
  },
): PersonMediaLinkWithItem | null {
  const mediaItem = toMediaItemWithUrls(link.mediaItem);
  if (!mediaItem) return null;
  return {
    id: link.id,
    usage: link.usage,
    slot: link.slot,
    bodyRegion: link.bodyRegion,
    bodyMarkId: link.bodyMarkId,
    bodyModificationId: link.bodyModificationId,
    cosmeticProcedureId: link.cosmeticProcedureId,
    isFavorite: link.isFavorite,
    sortOrder: link.sortOrder,
    notes: link.notes,
    mediaItem,
  };
}

export async function getPersonHeadshots(
  personId: string,
  slot?: number,
): Promise<PersonMediaLinkWithItem[]> {
  const links = await prisma.personMediaLink.findMany({
    where: {
      personId,
      usage: "HEADSHOT",
      ...(slot !== undefined ? { slot } : {}),
    },
    include: { mediaItem: true },
    orderBy: [{ slot: "asc" }, { sortOrder: "asc" }],
  });

  return links
    .map((link) => toPersonMediaLinkWithItem(link))
    .filter((item): item is PersonMediaLinkWithItem => item !== null);
}

export async function getPersonMediaByUsage(
  personId: string,
  usage: PersonMediaUsage,
): Promise<PersonMediaLinkWithItem[]> {
  const links = await prisma.personMediaLink.findMany({
    where: { personId, usage },
    include: { mediaItem: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return links
    .map((link) => toPersonMediaLinkWithItem(link))
    .filter((item): item is PersonMediaLinkWithItem => item !== null);
}

export async function getPersonMediaForEntity(
  personId: string,
  entityType: "bodyMark" | "bodyModification" | "cosmeticProcedure",
  entityId: string,
): Promise<PersonMediaLinkWithItem[]> {
  const whereClause: Record<string, string> = { personId };
  if (entityType === "bodyMark") whereClause.bodyMarkId = entityId;
  else if (entityType === "bodyModification") whereClause.bodyModificationId = entityId;
  else whereClause.cosmeticProcedureId = entityId;

  const links = await prisma.personMediaLink.findMany({
    where: whereClause,
    include: { mediaItem: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return links
    .map((link) => toPersonMediaLinkWithItem(link))
    .filter((item): item is PersonMediaLinkWithItem => item !== null);
}
