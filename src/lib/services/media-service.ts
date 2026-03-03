import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { PhotoVariants, PhotoUrls } from "@/lib/types";
import type { MediaItemWithUrls, PersonMediaUsage } from "@/lib/types";
import type { GalleryItem, DuplicateMatch, SimilarMatch } from "@/lib/types";
import type { PersonMediaLink } from "@/generated/prisma/client";
import { hammingDistance } from "@/lib/image-hash";

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
  focalX?: number | null;
  focalY?: number | null;
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
    focalX: item.focalX ?? null,
    focalY: item.focalY ?? null,
  };
}

// ─── GalleryItem mappers ─────────────────────────────────────────────────────

export function toGalleryItem(
  item: MediaItemWithLinks,
  opts?: { coverMediaItemId?: string | null },
): GalleryItem {
  const firstLink = item.links[0];
  return {
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    originalWidth: item.originalWidth,
    originalHeight: item.originalHeight,
    caption: item.caption,
    createdAt: item.createdAt,
    urls: item.urls,
    focalX: item.focalX,
    focalY: item.focalY,
    tags: item.tags,
    isFavorite: firstLink?.isFavorite ?? false,
    sortOrder: firstLink?.sortOrder ?? 0,
    isCover: opts?.coverMediaItemId === item.id,
    links: item.links,
    collectionIds: item.collectionIds,
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
  if (!tags || tags.length === 0) return "PROFILE";
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  if (tagSet.has("portrait") || tagSet.has("headshot")) return "HEADSHOT";
  if (tagSet.has("tattoo") || tagSet.has("body_mark")) return "BODY_MARK";
  if (tagSet.has("body_modification") || tagSet.has("piercing")) return "BODY_MODIFICATION";
  if (tagSet.has("cosmetic_procedure")) return "COSMETIC_PROCEDURE";
  if (tagSet.has("profile")) return "PROFILE";
  if (tagSet.has("portfolio")) return "PORTFOLIO";
  return "PROFILE";
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

// ─── Direct media creation (skips legacy Photo table) ────────────────────────

type CreateMediaItemDirectInput = {
  sessionId: string;
  filename: string;
  mimeType: string;
  size: number;
  originalWidth: number;
  originalHeight: number;
  variants: PhotoVariants;
  caption?: string;
  sortOrder?: number;
  personId?: string;
  usage?: PersonMediaUsage;
  slot?: number;
  setId?: string;
  hash?: string;
  phash?: string;
};

export async function createMediaItemDirect(
  input: CreateMediaItemDirectInput,
): Promise<{ id: string; filename: string; urls: ReturnType<typeof buildPhotoUrls> }> {
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
        tags: [],
        hash: input.hash,
        phash: input.phash,
      },
    });

    // Person context: create PersonMediaLink(s)
    if (input.personId) {
      const usage = input.usage ?? "PROFILE";

      await tx.personMediaLink.create({
        data: {
          personId: input.personId,
          mediaItemId,
          usage,
          slot: usage === "HEADSHOT" ? input.slot : undefined,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      // Headshot files also get a PROFILE link so they appear in both views
      if (usage === "HEADSHOT") {
        await tx.personMediaLink.create({
          data: {
            personId: input.personId,
            mediaItemId,
            usage: "PROFILE",
            sortOrder: input.sortOrder ?? 0,
          },
        });
      }
    }

    // Set context: create SetMediaItem + PersonMediaLinks for MODEL participants
    if (input.setId) {
      await tx.setMediaItem.create({
        data: {
          setId: input.setId,
          mediaItemId,
          sortOrder: input.sortOrder ?? 0,
        },
      });

      // Auto-assign cover if the set doesn't have one yet
      const set = await tx.set.findUnique({
        where: { id: input.setId },
        select: { coverMediaItemId: true },
      });
      if (set && !set.coverMediaItemId) {
        await tx.set.update({
          where: { id: input.setId },
          data: { coverMediaItemId: mediaItemId },
        });
      }

      // Auto-link MODEL participants
      const modelParticipants = await tx.setParticipant.findMany({
        where: { setId: input.setId, role: "MODEL" },
        select: { personId: true },
      });

      for (const participant of modelParticipants) {
        await tx.personMediaLink.create({
          data: {
            personId: participant.personId,
            mediaItemId,
            usage: "PORTFOLIO",
          },
        });
      }
    }
  });

  return {
    id: mediaItemId,
    filename: input.filename,
    urls: buildPhotoUrls(input.variants),
  };
}

export async function getFilledHeadshotSlots(
  personId: string,
): Promise<number[]> {
  const links = await prisma.personMediaLink.findMany({
    where: {
      personId,
      usage: "HEADSHOT",
      slot: { not: null },
    },
    select: { slot: true },
    orderBy: { slot: "asc" },
  });

  return links
    .map((l) => l.slot)
    .filter((s): s is number => s !== null);
}

// ─── Person media as GalleryItems ────────────────────────────────────────────

export async function getPersonMediaGallery(
  personId: string,
  sessionId: string,
): Promise<GalleryItem[]> {
  const items = await prisma.mediaItem.findMany({
    where: { sessionId },
    include: {
      personMediaLinks: {
        where: { personId },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: GalleryItem[] = [];
  for (const item of items) {
    const variants = (item.variants ?? {}) as PhotoVariants;
    if (!variants.original && !item.fileRef) continue;

    const link = item.personMediaLinks[0];
    results.push({
      id: item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      caption: item.caption,
      createdAt: item.createdAt,
      urls: buildPhotoUrls(variants, item.fileRef),
      focalX: item.focalX ?? null,
      focalY: item.focalY ?? null,
      tags: item.tags,
      isFavorite: link?.isFavorite ?? false,
      sortOrder: link?.sortOrder ?? 0,
      isCover: false,
    });
  }
  return results;
}

// ─── Set media as GalleryItems ───────────────────────────────────────────────

export async function getSetMediaGallery(
  setId: string,
  coverMediaItemId?: string | null,
): Promise<GalleryItem[]> {
  const links = await prisma.setMediaItem.findMany({
    where: { setId },
    include: { mediaItem: true },
    orderBy: { sortOrder: "asc" },
  });

  const results: GalleryItem[] = [];
  for (const link of links) {
    const item = link.mediaItem;
    const variants = (item.variants ?? {}) as PhotoVariants;
    if (!variants.original && !item.fileRef) continue;

    results.push({
      id: item.id,
      filename: item.filename,
      mimeType: item.mimeType,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      caption: link.caption ?? item.caption,
      createdAt: item.createdAt,
      urls: buildPhotoUrls(variants, item.fileRef),
      focalX: item.focalX ?? null,
      focalY: item.focalY ?? null,
      tags: item.tags,
      isFavorite: false,
      sortOrder: link.sortOrder,
      isCover: coverMediaItemId === item.id,
    });
  }
  return results;
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

export type HeadshotData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

export async function getHeadshotsForPersons(
  personIds: string[],
  slot?: number,
): Promise<Map<string, HeadshotData>> {
  if (personIds.length === 0) return new Map();

  const links = await prisma.personMediaLink.findMany({
    where: {
      personId: { in: personIds },
      usage: "HEADSHOT",
      ...(slot !== undefined ? { slot } : {}),
    },
    include: { mediaItem: true },
    orderBy: [{ slot: "asc" }, { sortOrder: "asc" }],
  });

  const result = new Map<string, HeadshotData>();
  for (const link of links) {
    if (!result.has(link.personId)) {
      const variants = (link.mediaItem.variants ?? {}) as PhotoVariants;
      const url = variants.profile_128
        ? buildUrl(variants.profile_128)
        : variants.original
          ? buildUrl(variants.original)
          : link.mediaItem.fileRef
            ? buildUrl(link.mediaItem.fileRef)
            : null;
      if (url) {
        result.set(link.personId, {
          url,
          focalX: link.mediaItem.focalX ?? null,
          focalY: link.mediaItem.focalY ?? null,
        });
      }
    }
  }
  return result;
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

// ─── MediaManager queries ───────────────────────────────────────────────────

export type MediaItemWithLinks = {
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  caption: string | null;
  tags: string[];
  notes: string | null;
  createdAt: Date;
  urls: PhotoUrls;
  focalX: number | null;
  focalY: number | null;
  focalSource: string | null;
  focalStatus: string | null;
  links: {
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
  }[];
  collectionIds: string[];
};

export async function getMediaItemsWithLinks(
  sessionId: string,
  personId: string,
): Promise<MediaItemWithLinks[]> {
  const items = await prisma.mediaItem.findMany({
    where: { sessionId },
    include: {
      personMediaLinks: {
        where: { personId },
      },
      collectionItems: {
        select: { collectionId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return items
    .map((item) => {
      const variants = (item.variants ?? {}) as PhotoVariants;
      if (!variants.original && !item.fileRef) return null;

      return {
        id: item.id,
        filename: item.filename,
        mimeType: item.mimeType,
        originalWidth: item.originalWidth,
        originalHeight: item.originalHeight,
        caption: item.caption,
        tags: item.tags,
        notes: item.notes,
        createdAt: item.createdAt,
        urls: buildPhotoUrls(variants, item.fileRef),
        focalX: item.focalX ?? null,
        focalY: item.focalY ?? null,
        focalSource: item.focalSource ?? null,
        focalStatus: item.focalStatus ?? null,
        links: item.personMediaLinks.map((link) => ({
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
        })),
        collectionIds: item.collectionItems.map((ci) => ci.collectionId),
      };
    })
    .filter((item): item is MediaItemWithLinks => item !== null);
}

export type PersonMediaLinkUpdate = {
  usage?: PersonMediaUsage;
  slot?: number | null;
  bodyRegion?: string | null;
  bodyMarkId?: string | null;
  bodyModificationId?: string | null;
  cosmeticProcedureId?: string | null;
  isFavorite?: boolean;
  notes?: string | null;
};

export async function updatePersonMediaLink(
  linkId: string,
  data: PersonMediaLinkUpdate,
): Promise<PersonMediaLink> {
  return prisma.personMediaLink.update({
    where: { id: linkId },
    data,
  });
}

export async function batchUpdatePersonMediaLinks(
  linkIds: string[],
  data: PersonMediaLinkUpdate,
): Promise<void> {
  if (linkIds.length === 0) return;
  await prisma.personMediaLink.updateMany({
    where: { id: { in: linkIds } },
    data,
  });
}

export async function batchSetUsage(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
): Promise<void> {
  if (mediaItemIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const mediaItemId of mediaItemIds) {
      await tx.personMediaLink.upsert({
        where: {
          personId_mediaItemId_usage: {
            personId,
            mediaItemId,
            usage,
          },
        },
        update: {},
        create: {
          personId,
          mediaItemId,
          usage,
        },
      });
    }
  });
}

export async function batchRemoveUsage(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
): Promise<void> {
  if (mediaItemIds.length === 0) return;

  await prisma.personMediaLink.deleteMany({
    where: {
      personId,
      mediaItemId: { in: mediaItemIds },
      usage,
    },
  });
}

// ─── Set cover photos ────────────────────────────────────────────────────────

export async function getCoverPhotosForSets(
  setIds: string[],
): Promise<Map<string, string>> {
  if (setIds.length === 0) return new Map();

  // 1. Load sets that have an explicit cover
  const setsWithCover = await prisma.set.findMany({
    where: { id: { in: setIds }, coverMediaItemId: { not: null } },
    select: {
      id: true,
      coverMediaItem: {
        select: { variants: true, fileRef: true },
      },
    },
  });

  const result = new Map<string, string>();
  for (const s of setsWithCover) {
    if (s.coverMediaItem) {
      const variants = (s.coverMediaItem.variants ?? {}) as PhotoVariants;
      const url = variants.gallery_512
        ? buildUrl(variants.gallery_512)
        : variants.original
          ? buildUrl(variants.original)
          : s.coverMediaItem.fileRef
            ? buildUrl(s.coverMediaItem.fileRef)
            : null;
      if (url) result.set(s.id, url);
    }
  }

  // 2. For sets without a cover, fall back to first SetMediaItem
  const missingIds = setIds.filter((id) => !result.has(id));
  if (missingIds.length > 0) {
    const fallbackLinks = await prisma.setMediaItem.findMany({
      where: { setId: { in: missingIds } },
      include: { mediaItem: { select: { variants: true, fileRef: true } } },
      orderBy: { sortOrder: "asc" },
    });

    for (const link of fallbackLinks) {
      if (result.has(link.setId)) continue;
      const variants = (link.mediaItem.variants ?? {}) as PhotoVariants;
      const url = variants.gallery_512
        ? buildUrl(variants.gallery_512)
        : variants.original
          ? buildUrl(variants.original)
          : link.mediaItem.fileRef
            ? buildUrl(link.mediaItem.fileRef)
            : null;
      if (url) result.set(link.setId, url);
    }
  }

  return result;
}

// ─── Duplicate detection ──────────────────────────────────────────────────

function getThumbnailUrl(variants: unknown, fileRef?: string | null): string {
  const v = (variants ?? {}) as PhotoVariants;
  if (v.gallery_512) return buildUrl(v.gallery_512);
  if (v.profile_256) return buildUrl(v.profile_256);
  if (v.original) return buildUrl(v.original);
  if (fileRef) return buildUrl(fileRef);
  return "";
}

/** Find exact duplicates by SHA-256 hash, grouped by scope */
export async function findExactDuplicates(
  hash: string,
  opts?: { personId?: string; sessionId?: string },
): Promise<DuplicateMatch[]> {
  const items = await prisma.mediaItem.findMany({
    where: { hash },
    include: {
      personMediaLinks: {
        select: {
          personId: true,
          person: { select: { aliases: { where: { type: "common" }, take: 1 } } },
        },
      },
    },
  });

  const matches: DuplicateMatch[] = [];

  for (const item of items) {
    const personLink = item.personMediaLinks[0];
    const personName = personLink?.person?.aliases?.[0]?.name ?? null;

    let scope: DuplicateMatch["scope"] = "global";

    if (opts?.sessionId && item.sessionId === opts.sessionId) {
      scope = "same_session";
    } else if (opts?.personId && personLink?.personId === opts.personId) {
      scope = "same_person";
    }

    matches.push({
      mediaItemId: item.id,
      filename: item.filename,
      thumbnailUrl: getThumbnailUrl(item.variants, item.fileRef),
      sessionId: item.sessionId,
      personName,
      scope,
    });
  }

  // Sort: same_session first, then same_person, then global
  const scopeOrder = { same_session: 0, same_person: 1, global: 2 };
  matches.sort((a, b) => scopeOrder[a.scope] - scopeOrder[b.scope]);

  return matches;
}

/** Find visually similar images by perceptual hash (Hamming distance) */
export async function findSimilarImages(
  phash: string,
  opts?: { personId?: string; limit?: number; threshold?: number },
): Promise<SimilarMatch[]> {
  const threshold = opts?.threshold ?? 10;
  const limit = opts?.limit ?? 20;

  // Load all non-null phash values
  const rows = await prisma.mediaItem.findMany({
    where: { phash: { not: null } },
    select: {
      id: true,
      filename: true,
      variants: true,
      fileRef: true,
      originalWidth: true,
      originalHeight: true,
      phash: true,
      personMediaLinks: {
        take: 1,
        select: {
          person: { select: { aliases: { where: { type: "common" }, take: 1 } } },
        },
      },
    },
  });

  const results: SimilarMatch[] = [];

  for (const row of rows) {
    if (!row.phash) continue;
    const dist = hammingDistance(phash, row.phash);
    if (dist > threshold || dist === 0) continue; // skip self (dist=0 is exact match)

    results.push({
      mediaItemId: row.id,
      filename: row.filename,
      thumbnailUrl: getThumbnailUrl(row.variants, row.fileRef),
      originalWidth: row.originalWidth,
      originalHeight: row.originalHeight,
      distance: dist,
      personName: row.personMediaLinks[0]?.person?.aliases?.[0]?.name ?? null,
    });
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, limit);
}

/** Replace a MediaItem's file data while preserving all links/tags/collections */
export async function replaceMediaItemFile(
  mediaItemId: string,
  newData: {
    variants: PhotoVariants;
    size: number;
    originalWidth: number;
    originalHeight: number;
    hash: string;
    phash: string;
    filename: string;
    mimeType: string;
  },
): Promise<void> {
  await prisma.mediaItem.update({
    where: { id: mediaItemId },
    data: {
      variants: newData.variants as unknown as Record<string, string>,
      size: newData.size,
      originalWidth: newData.originalWidth,
      originalHeight: newData.originalHeight,
      hash: newData.hash,
      phash: newData.phash,
      filename: newData.filename,
      mimeType: newData.mimeType,
    },
  });
}

/** Get a single MediaItem's phash for similarity search */
export async function getMediaItemPhash(
  mediaItemId: string,
): Promise<{
  phash: string | null;
  filename: string;
  thumbnailUrl: string;
  originalWidth: number;
  originalHeight: number;
} | null> {
  const item = await prisma.mediaItem.findUnique({
    where: { id: mediaItemId },
    select: {
      phash: true,
      filename: true,
      variants: true,
      fileRef: true,
      originalWidth: true,
      originalHeight: true,
    },
  });
  if (!item) return null;
  return {
    phash: item.phash,
    filename: item.filename,
    thumbnailUrl: getThumbnailUrl(item.variants, item.fileRef),
    originalWidth: item.originalWidth,
    originalHeight: item.originalHeight,
  };
}
