import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { PhotoVariants, PhotoUrls } from "@/lib/types";
import { parsePhotoVariants } from "@/lib/types";
import type { MediaItemWithUrls, PersonMediaUsage } from "@/lib/types";
import type { GalleryItem, DuplicateMatch, SimilarMatch } from "@/lib/types";
import type { PersonMediaLink } from "@/generated/prisma/client";
import { hammingDistance } from "@/lib/image-hash";
import { buildUrl, buildPhotoUrls } from "@/lib/media-url";

function assertValidVariants(variants: PhotoVariants): void {
  if (!variants.master_4000 && !variants.original) {
    throw new Error("Cannot create MediaItem without a valid 'master_4000' or 'original' variant");
  }
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
  const variants = parsePhotoVariants(item.variants) ?? ({} as PhotoVariants);
  if (!variants.master_4000 && !variants.original && !item.fileRef) return null;
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
    skillEventIds: item.skillEventIds,
    setCount: item.setCount,
    sourceVideoRef: item.sourceVideoRef,
    sourceTimecodeMs: item.sourceTimecodeMs,
  };
}


// ─── Session gallery (production photos) ────────────────────────────────────

export async function getSessionMediaGallery(sessionId: string): Promise<GalleryItem[]> {
  const items = await prisma.mediaItem.findMany({
    where: { sessionId },
    include: {
      setMediaItems: { select: { setId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: GalleryItem[] = [];
  for (const item of items) {
    const variants = (item.variants ?? {}) as PhotoVariants;
    if (!variants.master_4000 && !variants.original && !item.fileRef) continue;

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
      isFavorite: false,
      sortOrder: 0,
      isCover: false,
      setCount: item.setMediaItems.length,
    });
  }
  return results;
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
  assertValidVariants(input.variants);
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
  if (tagSet.has("profile")) return "PROFILE";
  if (tagSet.has("portfolio")) return "PORTFOLIO";
  return "PROFILE";
}

export async function createMediaItemForPerson(
  input: CreatePersonMediaItemInput,
): Promise<string> {
  assertValidVariants(input.variants);
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
  sourceVideoRef?: string;
  sourceTimecodeMs?: number;
  isAnnotation?: boolean;
};

export async function createMediaItemDirect(
  input: CreateMediaItemDirectInput,
): Promise<{ id: string; filename: string; urls: ReturnType<typeof buildPhotoUrls> }> {
  assertValidVariants(input.variants);
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
        sourceVideoRef: input.sourceVideoRef,
        sourceTimecodeMs: input.sourceTimecodeMs,
        isAnnotation: input.isAnnotation ?? false,
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

      // Auto-link MODEL participants (on-camera roles)
      const modelParticipants = await tx.setParticipant.findMany({
        where: { setId: input.setId, roleDefinition: { slug: "model" } },
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
    where: { sessionId, isAnnotation: false },
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
    if (!variants.master_4000 && !variants.original && !item.fileRef) continue;

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
  results.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return results;
}

// ─── Person media across all sessions ───────────────────────────────────────

export type PersonMediaPage = {
  items: GalleryItem[]
  nextCursor: string | null
}

export type PersonSessionSummary = {
  sessionId: string
  sessionName: string | null
  isReference: boolean
  mediaCount: number
}

function personSessionWhere(personId: string) {
  return {
    OR: [
      { personId },
      { contributions: { some: { personId } } },
      { setSessionLinks: { some: { set: { participants: { some: { personId } } } } } },
    ],
  }
}

/**
 * Returns all sessions the person has media in, with photo counts.
 * Used to populate the session filter in the cross-session picker.
 */
export async function getPersonSessionsWithMedia(personId: string): Promise<PersonSessionSummary[]> {
  const rows = await prisma.mediaItem.groupBy({
    by: ['sessionId'],
    where: {
      isAnnotation: false,
      session: personSessionWhere(personId),
    },
    _count: { _all: true },
  })
  if (rows.length === 0) return []

  const sessions = await prisma.session.findMany({
    where: { id: { in: rows.map(r => r.sessionId) } },
    select: { id: true, name: true, personId: true, date: true },
    orderBy: { date: 'desc' },
  })

  const countMap = new Map(rows.map(r => [r.sessionId, r._count._all]))
  return sessions.map(s => ({
    sessionId: s.id,
    sessionName: s.name,
    isReference: s.personId === personId,
    mediaCount: countMap.get(s.id) ?? 0,
  }))
}

/**
 * Returns MediaItems from ALL sessions the person participated in:
 *   - Reference session (session.personId = personId)
 *   - Production sessions (SessionContribution.personId = personId)
 *   - Set sessions (SetParticipant.personId = personId via SetSession)
 * Excludes annotation-derived items (isAnnotation=true).
 * Used by the cross-session photo picker for entity/detail documentation.
 */
export async function getPersonMediaAcrossSessions(
  personId: string,
  options?: { cursor?: string; limit?: number; search?: string; sessionId?: string },
): Promise<PersonMediaPage> {
  const limit = options?.limit ?? 60
  const rows = await prisma.mediaItem.findMany({
    where: {
      isAnnotation: false,
      ...(options?.sessionId
        ? { sessionId: options.sessionId }
        : { session: personSessionWhere(personId) }),
      ...(options?.search
        ? { caption: { contains: options.search, mode: 'insensitive' } }
        : {}),
    },
    include: {
      personMediaLinks: { where: { personId } },
      session: { select: { id: true, name: true, date: true, personId: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options?.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore ? page[page.length - 1].id : null

  const items: GalleryItem[] = []
  for (const item of page) {
    const variants = (item.variants ?? {}) as PhotoVariants
    if (!variants.master_4000 && !variants.original && !item.fileRef) continue
    const link = item.personMediaLinks[0]
    items.push({
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
      sessionId: item.sessionId,
      sessionName: item.session.name ?? undefined,
    })
  }

  return { items, nextCursor }
}

// ─── Set media as GalleryItems ───────────────────────────────────────────────

export async function getSetMediaGallery(
  setId: string,
  coverMediaItemId?: string | null,
): Promise<GalleryItem[]> {
  const links = await prisma.setMediaItem.findMany({
    where: { setId },
    include: {
      mediaItem: {
        include: {
          session: { select: { id: true, name: true } },
          collectionItems: { select: { collectionId: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
  const results: GalleryItem[] = [];
  for (const link of links) {
    const item = link.mediaItem;
    const variants = (item.variants ?? {}) as PhotoVariants;
    if (!variants.master_4000 && !variants.original && !item.fileRef) continue;

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
      collectionIds: item.collectionItems.map((ci) => ci.collectionId),
      sourceVideoRef: item.sourceVideoRef,
      sourceTimecodeMs: item.sourceTimecodeMs,
      sessionId: item.sessionId,
      sessionName: item.session.name,
    });
  }
  return results;
}

// ─── Skill event media constraint check ──────────────────────────────────────

export async function getSkillEventMediaConstraints(
  mediaItemIds: string[],
): Promise<{ mediaItemId: string; skillEventCount: number }[]> {
  const links = await prisma.skillEventMedia.findMany({
    where: { mediaItemId: { in: mediaItemIds } },
    select: { mediaItemId: true },
  });
  const counts = new Map<string, number>();
  for (const l of links) {
    counts.set(l.mediaItemId, (counts.get(l.mediaItemId) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([mediaItemId, skillEventCount]) => ({
    mediaItemId,
    skillEventCount,
  }));
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
  bodyRegions: string[];
  bodyMarkId: string | null;
  bodyModificationId: string | null;
  cosmeticProcedureId: string | null;
  categoryId: string | null;
  personaId: string | null;
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
    bodyRegions?: string[];
    bodyMarkId: string | null;
    bodyModificationId: string | null;
    cosmeticProcedureId: string | null;
    categoryId: string | null;
    personaId?: string | null;
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
    bodyRegions: link.bodyRegions ?? [],
    bodyMarkId: link.bodyMarkId,
    bodyModificationId: link.bodyModificationId,
    cosmeticProcedureId: link.cosmeticProcedureId,
    categoryId: link.categoryId,
    personaId: link.personaId ?? null,
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

/**
 * Batch-fetch all entity-linked media for a person (body marks, modifications, procedures).
 * Returns a map keyed by entityId → thumbnail info[].
 */
export type EntityMediaThumbnail = {
  id: string;
  url: string;
  width: number;
  height: number;
  focalX: number | null;
  focalY: number | null;
};

export async function getPersonEntityMedia(
  personId: string,
): Promise<Map<string, EntityMediaThumbnail[]>> {
  const links = await prisma.personMediaLink.findMany({
    where: {
      personId,
      OR: [
        { bodyMarkId: { not: null } },
        { bodyModificationId: { not: null } },
        { cosmeticProcedureId: { not: null } },
      ],
    },
    include: { mediaItem: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const result = new Map<string, EntityMediaThumbnail[]>();
  for (const link of links) {
    const entityId = link.bodyMarkId ?? link.bodyModificationId ?? link.cosmeticProcedureId;
    if (!entityId) continue;
    const variants = (link.mediaItem.variants ?? {}) as PhotoVariants;
    const url = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : (variants.master_4000 ?? variants.original)
        ? buildUrl((variants.master_4000 ?? variants.original)!)
        : null;
    if (!url) continue;
    if (!result.has(entityId)) result.set(entityId, []);
    result.get(entityId)!.push({
      id: link.mediaItem.id,
      url,
      width: link.mediaItem.originalWidth,
      height: link.mediaItem.originalHeight,
      focalX: link.mediaItem.focalX ?? null,
      focalY: link.mediaItem.focalY ?? null,
    });
  }
  return result;
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
    bodyRegions: string[];
    bodyMarkId: string | null;
    bodyModificationId: string | null;
    cosmeticProcedureId: string | null;
    categoryId: string | null;
    personaId: string | null;
    isFavorite: boolean;
    sortOrder: number;
    notes: string | null;
  }[];
  collectionIds: string[];
  skillEventIds: string[];
  setCount: number;
  sourceVideoRef: string | null;
  sourceTimecodeMs: number | null;
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
      skillEventMedia: {
        select: { skillEventId: true },
      },
      setMediaItems: {
        select: { setId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return items
    .map((item) => {
      const variants = (item.variants ?? {}) as PhotoVariants;
      if (!variants.master_4000 && !variants.original && !item.fileRef) return null;

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
          bodyRegions: link.bodyRegions ?? [],
          bodyMarkId: link.bodyMarkId,
          bodyModificationId: link.bodyModificationId,
          cosmeticProcedureId: link.cosmeticProcedureId,
          categoryId: link.categoryId,
          personaId: link.personaId ?? null,
          isFavorite: link.isFavorite,
          sortOrder: link.sortOrder,
          notes: link.notes,
        })),
        collectionIds: item.collectionItems.map((ci) => ci.collectionId),
        skillEventIds: item.skillEventMedia.map((sem) => sem.skillEventId),
        setCount: item.setMediaItems.length,
        sourceVideoRef: item.sourceVideoRef,
        sourceTimecodeMs: item.sourceTimecodeMs,
      };
    })
    .filter((item): item is MediaItemWithLinks => item !== null);
}

export type PersonMediaLinkUpdate = {
  usage?: PersonMediaUsage;
  slot?: number | null;
  bodyRegion?: string | null;
  bodyRegions?: string[];
  bodyMarkId?: string | null;
  bodyModificationId?: string | null;
  cosmeticProcedureId?: string | null;
  categoryId?: string | null;
  personaId?: string | null;
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
  categoryId?: string | null,
): Promise<void> {
  if (mediaItemIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    // Single query to find all existing links
    const existing = await tx.personMediaLink.findMany({
      where: {
        personId,
        mediaItemId: { in: mediaItemIds },
        usage,
        ...(usage === "DETAIL" ? { categoryId } : {}),
      },
      select: { mediaItemId: true },
    });
    const existingIds = new Set(existing.map((e) => e.mediaItemId));

    // Bulk-create only the missing links
    const toCreate = mediaItemIds.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await tx.personMediaLink.createMany({
        data: toCreate.map((mediaItemId) => ({
          personId,
          mediaItemId,
          usage,
          ...(categoryId ? { categoryId } : {}),
        })),
      });
    }
  });
}

export async function batchRemoveUsage(
  personId: string,
  mediaItemIds: string[],
  usage: PersonMediaUsage,
  categoryId?: string | null,
): Promise<void> {
  if (mediaItemIds.length === 0) return;

  await prisma.personMediaLink.deleteMany({
    where: {
      personId,
      mediaItemId: { in: mediaItemIds },
      usage,
      ...(usage === "DETAIL" && categoryId ? { categoryId } : {}),
    },
  });
}

// ─── Set cover photos ────────────────────────────────────────────────────────

export type CoverPhotoData = {
  url: string;
  focalX: number | null;
  focalY: number | null;
};

export async function getCoverPhotosForSets(
  setIds: string[],
): Promise<Map<string, CoverPhotoData>> {
  if (setIds.length === 0) return new Map();

  // 1. Load sets that have an explicit cover
  const setsWithCover = await prisma.set.findMany({
    where: { id: { in: setIds }, coverMediaItemId: { not: null } },
    select: {
      id: true,
      coverMediaItem: {
        select: { variants: true, fileRef: true, focalX: true, focalY: true },
      },
    },
  });

  const result = new Map<string, CoverPhotoData>();
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
      if (url) result.set(s.id, {
        url,
        focalX: s.coverMediaItem.focalX ?? null,
        focalY: s.coverMediaItem.focalY ?? null,
      });
    }
  }

  // 2. For sets without a cover, fall back to first SetMediaItem
  const missingIds = setIds.filter((id) => !result.has(id));
  if (missingIds.length > 0) {
    const fallbackLinks = await prisma.setMediaItem.findMany({
      where: { setId: { in: missingIds } },
      include: { mediaItem: { select: { variants: true, fileRef: true, focalX: true, focalY: true } } },
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
      if (url) result.set(link.setId, {
        url,
        focalX: link.mediaItem.focalX ?? null,
        focalY: link.mediaItem.focalY ?? null,
      });
    }
  }

  return result;
}

/**
 * Batch-load a cover photo URL for each session (first media item by sortOrder).
 */
export async function getCoverPhotosForSessions(
  sessionIds: string[],
): Promise<Map<string, CoverPhotoData>> {
  if (sessionIds.length === 0) return new Map();

  // Fetch sessions to get explicit cover FK, plus all media items for fallback
  const [sessions, mediaItems] = await Promise.all([
    prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: {
        id: true,
        coverMediaItemId: true,
        coverMediaItem: {
          select: { variants: true, fileRef: true, focalX: true, focalY: true },
        },
      },
    }),
    prisma.mediaItem.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, variants: true, fileRef: true, focalX: true, focalY: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Build fallback map: first media item per session
  const fallbackMap = new Map<string, CoverPhotoData>();
  for (const item of mediaItems) {
    if (fallbackMap.has(item.sessionId)) continue;
    const variants = (item.variants ?? {}) as PhotoVariants;
    const url = variants.gallery_512
      ? buildUrl(variants.gallery_512)
      : variants.master_4000
        ? buildUrl(variants.master_4000)
        : item.fileRef
          ? buildUrl(item.fileRef)
          : null;
    if (url) fallbackMap.set(item.sessionId, { url, focalX: item.focalX ?? null, focalY: item.focalY ?? null });
  }

  // Prefer explicit cover over fallback
  const result = new Map<string, CoverPhotoData>();
  for (const session of sessions) {
    if (session.coverMediaItem) {
      const variants = (session.coverMediaItem.variants ?? {}) as PhotoVariants;
      const url = variants.gallery_512
        ? buildUrl(variants.gallery_512)
        : variants.master_4000
          ? buildUrl(variants.master_4000)
          : session.coverMediaItem.fileRef
            ? buildUrl(session.coverMediaItem.fileRef)
            : null;
      if (url) {
        result.set(session.id, {
          url,
          focalX: session.coverMediaItem.focalX ?? null,
          focalY: session.coverMediaItem.focalY ?? null,
        });
        continue;
      }
    }
    const fallback = fallbackMap.get(session.id);
    if (fallback) result.set(session.id, fallback);
  }

  return result;
}

// ─── Duplicate detection ──────────────────────────────────────────────────

function getThumbnailUrl(variants: unknown, fileRef?: string | null): string {
  const v = (variants ?? {}) as PhotoVariants;
  if (v.gallery_512) return buildUrl(v.gallery_512);
  if (v.master_4000) return buildUrl(v.master_4000);
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
          person: { select: { aliases: { where: { isCommon: true }, take: 1 } } },
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
          person: { select: { aliases: { where: { isCommon: true }, take: 1 } } },
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
