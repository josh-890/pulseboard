import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { PhotoVariants } from "@/lib/types";
import { parsePhotoVariants } from "@/lib/types";
import type { MediaItemWithUrls, PersonMediaUsage } from "@/lib/types";
import type { GalleryItem, DuplicateMatch, SimilarMatch } from "@/lib/types";
import type { PersonMediaLink } from "@/generated/prisma/client";
import { hammingDistance } from "@/lib/image-hash";
import { buildUrl, buildPhotoUrls } from "@/lib/media-url";
import {
  toGalleryItem as toGalleryItemPure,
  type MediaItemWithLinks as MediaItemWithLinksType,
} from "@/lib/gallery-mappers";

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
//
// Phase 2: the pure `toGalleryItem` mapper + the MediaItemWithLinks type
// both live in `@/lib/gallery-mappers` (client-safe — no server-only
// transitive deps). Re-exported here so existing call sites that import
// from `@/lib/services/media-service` keep working. The canonical mapper
// for raw Prisma rows (`mapMediaItemToGalleryItem`) stays in this file
// because it depends on `buildPhotoUrls` (tenant-context-aware,
// server-only).

export { toGalleryItemPure as toGalleryItem };
export type MediaItemWithLinks = MediaItemWithLinksType;

// ─── Canonical GalleryItem mapper (Phase 1 of multi-builder consolidation) ──
//
// SOLE OWNER of `MediaItem → GalleryItem` field derivation. Every relation
// the gallery info panel can surface is wired here so adding a new field is
// a single-place change. Callers (the half-dozen context-specific builders)
// keep their query autonomy — they pick the WHERE + which relations to
// include — but never duplicate the mapping logic. When a query doesn't
// include a relation, the corresponding GalleryItem field stays
// undefined; the lightbox renders only sections whose data is present.
//
// Migration policy: this mapper is the target shape; each legacy builder
// gets migrated one at a time. `toGalleryItem` (above) stays until its
// consumers are moved over in Phase 2/3.

/** Loose structural type the canonical mapper accepts. Every relation slot
 *  is optional — Prisma's actual return types satisfy this via structural
 *  compatibility, so callers don't need explicit casts. */
export type MediaItemForGallery = {
  // Always-present scalars (mandatory).
  id: string;
  filename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  caption: string | null;
  createdAt: Date;
  variants: unknown;
  fileRef: string | null;
  focalX: number | null;
  focalY: number | null;
  tags: string[];
  sessionId: string;
  sourceVideoRef: string | null;
  sourceTimecodeMs: number | null;

  // Optional relation slots — each maps to a single GalleryItem field.
  personMediaLinks?: Array<{
    id: string;
    usage: PersonMediaUsage;
    slot: number | null;
    bodyRegion: string | null;
    bodyRegions: string[];
    bodyMarkId: string | null;
    bodyModificationId: string | null;
    cosmeticProcedureId: string | null;
    categoryId: string | null;
    eraId: string | null;
    isFavorite: boolean;
    isAvatar: boolean;
    sortOrder: number;
    notes: string | null;
  }>;
  setMediaItems?: Array<{
    setId: string;
    set: { id: string; title: string };
  }>;
  collectionItems?: Array<{ collectionId: string }>;
  skillEventMedia?: Array<{ skillEventId: string }>;
  session?: { id: string; name: string | null } | null;
  copiedFromMediaItem?: {
    id: string;
    setMediaItems: Array<{ set: { id: string; title: string } | null }>;
  } | null;
};

export type MapGalleryItemOpts = {
  /** If set + matches item.id, GalleryItem.isCover is true. */
  coverMediaItemId?: string | null;
};

export function mapMediaItemToGalleryItem(
  item: MediaItemForGallery,
  opts?: MapGalleryItemOpts,
): GalleryItem | null {
  const variants = parsePhotoVariants(item.variants) ?? ({} as PhotoVariants);
  // Guard: items with no usable file are dropped — the gallery can't
  // render them anyway and callers were already filtering inline.
  if (!variants.master_4000 && !variants.original && !item.fileRef) {
    return null;
  }

  const firstLink = item.personMediaLinks?.[0];
  const sourceFirstSet = item.copiedFromMediaItem?.setMediaItems[0]?.set ?? null;

  return {
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    originalWidth: item.originalWidth,
    originalHeight: item.originalHeight,
    caption: item.caption,
    createdAt: item.createdAt,
    urls: buildPhotoUrls(variants, item.fileRef),
    focalX: item.focalX,
    focalY: item.focalY,
    tags: item.tags,
    isFavorite: firstLink?.isFavorite ?? false,
    isAvatar: firstLink?.isAvatar ?? false,
    sortOrder: firstLink?.sortOrder ?? 0,
    isCover: opts?.coverMediaItemId === item.id,
    // Per-person link surface — present only when caller included
    // personMediaLinks. The info panel relies on this to render
    // usage / body regions / era / notes sections.
    links: item.personMediaLinks,
    collectionIds: item.collectionItems?.map((ci) => ci.collectionId),
    skillEventIds: item.skillEventMedia?.map((sem) => sem.skillEventId),
    setCount: item.setMediaItems?.length,
    setLinks: item.setMediaItems?.map((smi) => ({
      setId: smi.set.id,
      setTitle: smi.set.title,
    })),
    sourceVideoRef: item.sourceVideoRef,
    sourceTimecodeMs: item.sourceTimecodeMs,
    sessionId: item.sessionId,
    sessionName: item.session?.name ?? undefined,
    copiedFrom: item.copiedFromMediaItem
      ? {
          mediaItemId: item.copiedFromMediaItem.id,
          setId: sourceFirstSet?.id ?? null,
          setTitle: sourceFirstSet?.title ?? null,
        }
      : null,
  };
}


// ─── Session gallery (production photos) ────────────────────────────────────

export async function getSessionMediaGallery(sessionId: string): Promise<GalleryItem[]> {
  const items = await prisma.mediaItem.findMany({
    where: { sessionId },
    include: {
      setMediaItems: { select: { setId: true, set: { select: { id: true, title: true } } } },
      // Provenance JOIN — only populated when the item was copied here from
      // a production set's MediaItem. We follow that source's first
      // SetMediaItem so the info panel can show "from [SetName]". One
      // shallow hop; the source MediaItem may itself live in N sets — we
      // pick the first by sort order, since the badge is informational
      // and a single chip reads better than a list.
      copiedFromMediaItem: {
        select: {
          id: true,
          setMediaItems: {
            select: { setId: true, set: { select: { id: true, title: true } } },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Phase 3: field assignment delegated to the canonical mapper. The query
  // chooses which relations to include (its responsibility); the mapper
  // turns relations into GalleryItem fields (its responsibility).
  const results: GalleryItem[] = [];
  for (const item of items) {
    const gi = mapMediaItemToGalleryItem(item);
    if (gi) results.push(gi);
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
  // Phase 1 migration: query stays focused on this page's needs (only
  // THIS person's links + the copy-source breadcrumb), but the mapping
  // is delegated to the canonical mapper so any future GalleryItem field
  // appears here automatically as soon as the matching include is added.
  const items = await prisma.mediaItem.findMany({
    where: { sessionId, isAnnotation: false },
    include: {
      personMediaLinks: {
        where: { personId },
      },
      // Provenance breadcrumb — surfaces "from [SetName]" in the lightbox
      // info panel for images that were copied here from a production set.
      // One shallow hop: source MediaItem → its first SetMediaItem → set.
      copiedFromMediaItem: {
        select: {
          id: true,
          setMediaItems: {
            select: { set: { select: { id: true, title: true } } },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: GalleryItem[] = [];
  for (const item of items) {
    const gi = mapMediaItemToGalleryItem(item);
    if (gi) results.push(gi);
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

  // Phase 3: mapper handles every relation present in the query. sessionId
  // + sessionName flow through `session.name`; isFavorite + isAvatar through
  // `personMediaLinks[0]` (the query already filters by this person).
  const items: GalleryItem[] = []
  for (const item of page) {
    const gi = mapMediaItemToGalleryItem(item)
    if (gi) items.push(gi)
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
  // Phase 3: mapper handles the base shape; the SetMediaItem-specific
  // overrides (link.caption + link.sortOrder) are patched on top because
  // they're set-context fields the mapper can't see through the
  // SetMediaItem bridge. Same idea applies for any future builder that
  // sits on a join table.
  const results: GalleryItem[] = [];
  for (const link of links) {
    const base = mapMediaItemToGalleryItem(link.mediaItem, { coverMediaItemId });
    if (!base) continue;
    results.push({
      ...base,
      caption: link.caption ?? base.caption,
      sortOrder: link.sortOrder,
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
  eraId: string | null;
  isFavorite: boolean;
  isAvatar: boolean;
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
    eraId?: string | null;
    isFavorite: boolean;
    isAvatar: boolean;
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
    eraId: link.eraId ?? null,
    isFavorite: link.isFavorite,
    isAvatar: link.isAvatar,
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

function headshotDataFromLink(link: {
  personId: string;
  mediaItem: { variants: unknown; focalX: number | null; focalY: number | null; fileRef: string | null; motifTemplateId?: string | null };
}): HeadshotData | null {
  const variants = (link.mediaItem.variants ?? {}) as PhotoVariants;
  const isNormalized = !!link.mediaItem.motifTemplateId;

  // Normalized (template-aligned) images already carry the target aspect (e.g. 2:3),
  // so display them via an aspect-preserving variant — the 4:5 profile_* cover crop
  // would re-crop and undo the alignment.
  const url = isNormalized
    ? (variants.view_1200 ? buildUrl(variants.view_1200)
      : variants.gallery_512 ? buildUrl(variants.gallery_512)
      : variants.master_4000 ? buildUrl(variants.master_4000)
      : variants.original ? buildUrl(variants.original)
      : link.mediaItem.fileRef ? buildUrl(link.mediaItem.fileRef)
      : null)
    : (variants.profile_512 ? buildUrl(variants.profile_512)
      : variants.profile_256 ? buildUrl(variants.profile_256)
      : variants.profile_128 ? buildUrl(variants.profile_128)
      : variants.original ? buildUrl(variants.original)
      : link.mediaItem.fileRef ? buildUrl(link.mediaItem.fileRef)
      : null);
  if (!url) return null;

  // A normalized image is already centered/cropped — neutralize focal point so the
  // card's object-cover doesn't shift it.
  return {
    url,
    focalX: isNormalized ? null : (link.mediaItem.focalX ?? null),
    focalY: isNormalized ? null : (link.mediaItem.focalY ?? null),
  };
}

export async function getHeadshotsForPersons(
  personIds: string[],
  slot?: number,
): Promise<Map<string, HeadshotData>> {
  if (personIds.length === 0) return new Map();

  // Category-filter mode (slot filter active) — unchanged behaviour
  if (slot !== undefined) {
    const links = await prisma.personMediaLink.findMany({
      where: { personId: { in: personIds }, usage: "HEADSHOT", slot },
      include: { mediaItem: true },
      orderBy: [{ slot: "asc" }, { sortOrder: "asc" }],
    });
    const result = new Map<string, HeadshotData>();
    for (const link of links) {
      if (!result.has(link.personId)) {
        const data = headshotDataFromLink(link);
        if (data) result.set(link.personId, data);
      }
    }
    return result;
  }

  // Avatar mode — Pass 1: explicit isAvatar=true (any usage)
  const avatarLinks = await prisma.personMediaLink.findMany({
    where: { personId: { in: personIds }, isAvatar: true },
    include: { mediaItem: true },
  });
  const result = new Map<string, HeadshotData>();
  for (const link of avatarLinks) {
    if (!result.has(link.personId)) {
      const data = headshotDataFromLink(link);
      if (data) result.set(link.personId, data);
    }
  }

  // Pass 2: fallback for persons with no isAvatar set — old slot+sortOrder logic
  const missing = personIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const fallbackLinks = await prisma.personMediaLink.findMany({
      where: { personId: { in: missing }, usage: "HEADSHOT" },
      include: { mediaItem: true },
      orderBy: [{ slot: "asc" }, { sortOrder: "asc" }],
    });
    for (const link of fallbackLinks) {
      if (!result.has(link.personId)) {
        const data = headshotDataFromLink(link);
        if (data) result.set(link.personId, data);
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
  urls: ReturnType<typeof buildPhotoUrls>;
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
    const urls = buildPhotoUrls(variants, link.mediaItem.fileRef);
    const url = urls.gallery_512 ?? urls.master_4000 ?? urls.original;
    if (!url) continue;
    if (!result.has(entityId)) result.set(entityId, []);
    result.get(entityId)!.push({
      id: link.mediaItem.id,
      url,
      urls,
      width: link.mediaItem.originalWidth,
      height: link.mediaItem.originalHeight,
      focalX: link.mediaItem.focalX ?? null,
      focalY: link.mediaItem.focalY ?? null,
    });
  }
  return result;
}

// ─── Entity media cover (body-map hover photo) ──────────────────────────────

export type EntityMediaModel = "BodyMark" | "BodyModification" | "CosmeticProcedure";

/** Return `orderedIds` with `id` moved to the front. No-op if absent or already first. */
export function moveToFront(orderedIds: string[], id: string): string[] {
  if (!orderedIds.includes(id)) return orderedIds.slice();
  return [id, ...orderedIds.filter((x) => x !== id)];
}

function entityMediaWhere(
  model: EntityMediaModel,
  personId: string,
  entityId: string,
): { personId: string; bodyMarkId?: string; bodyModificationId?: string; cosmeticProcedureId?: string } {
  if (model === "BodyMark") return { personId, bodyMarkId: entityId };
  if (model === "BodyModification") return { personId, bodyModificationId: entityId };
  return { personId, cosmeticProcedureId: entityId };
}

/**
 * Make `mediaItemId` the cover (first) photo of a body feature by rewriting the
 * `sortOrder` of that entity's PersonMediaLinks — scoped by the entity FK so the
 * same image's HEADSHOT/REFERENCE links are untouched. The body map hover and
 * row strip read the first photo by `[sortOrder, createdAt]`, so the cover wins.
 */
export async function setEntityMediaCover(
  personId: string,
  entityModel: EntityMediaModel,
  entityId: string,
  mediaItemId: string,
): Promise<void> {
  const base = entityMediaWhere(entityModel, personId, entityId);
  await prisma.$transaction(async (tx) => {
    const links = await tx.personMediaLink.findMany({
      where: base,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { mediaItemId: true },
    });
    const ordered = moveToFront(links.map((l) => l.mediaItemId), mediaItemId);
    for (let i = 0; i < ordered.length; i++) {
      await tx.personMediaLink.updateMany({
        where: { ...base, mediaItemId: ordered[i] },
        data: { sortOrder: i },
      });
    }
  });
}

// ─── MediaManager queries ───────────────────────────────────────────────────
// `MediaItemWithLinks` type lives in `@/lib/gallery-mappers` (re-exported
// from the top of this file). The query function stays here because it's
// server-only.

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
      copiedFromMediaItem: {
        select: {
          id: true,
          setMediaItems: {
            select: { set: { select: { id: true, title: true } } },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
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
          eraId: link.eraId ?? null,
          isFavorite: link.isFavorite,
          isAvatar: link.isAvatar,
          sortOrder: link.sortOrder,
          notes: link.notes,
        })),
        collectionIds: item.collectionItems.map((ci) => ci.collectionId),
        skillEventIds: item.skillEventMedia.map((sem) => sem.skillEventId),
        setCount: item.setMediaItems.length,
        sourceVideoRef: item.sourceVideoRef,
        sourceTimecodeMs: item.sourceTimecodeMs,
        copiedFrom: (item.copiedFromMediaItem
          ? {
              mediaItemId: item.copiedFromMediaItem.id,
              setId: item.copiedFromMediaItem.setMediaItems[0]?.set.id ?? null,
              setTitle: item.copiedFromMediaItem.setMediaItems[0]?.set.title ?? null,
            }
          : null) as MediaItemWithLinks["copiedFrom"],
      } satisfies MediaItemWithLinks;
    })
    .filter((item): item is MediaItemWithLinks => item !== null)
    .sort((a, b) => (a.links[0]?.sortOrder ?? 0) - (b.links[0]?.sortOrder ?? 0));
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
  eraId?: string | null;
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
        : (variants.master_4000 ?? variants.original)
          ? buildUrl((variants.master_4000 ?? variants.original)!)
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

// ─── Entity Photos for reference session ─────────────────────────────────────

export type EntityPhotoGroup = {
  categoryId: string;
  categoryName: string;
  groupName: string;
  entityId: string | null;
  entityLabel: string | null;
  photos: {
    id: string;
    filename: string;
    url: string;
    originalWidth: number;
    originalHeight: number;
    focalX: number | null;
    focalY: number | null;
  }[];
};

/**
 * Returns all DETAIL photos in the given session grouped by category/entity.
 * Used for the "Entity Photos" section in MediaManager.
 */
export async function getEntityPhotosForSession(
  sessionId: string,
  personId: string,
): Promise<EntityPhotoGroup[]> {
  const links = await prisma.personMediaLink.findMany({
    where: {
      personId,
      usage: "DETAIL",
      mediaItem: { sessionId },
    },
    include: {
      mediaItem: {
        select: {
          id: true,
          filename: true,
          variants: true,
          fileRef: true,
          originalWidth: true,
          originalHeight: true,
          focalX: true,
          focalY: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          group: { select: { name: true } },
        },
      },
    },
    orderBy: [{ categoryId: "asc" }, { createdAt: "asc" }],
  });

  const groupMap = new Map<string, EntityPhotoGroup>();

  for (const link of links) {
    const { mediaItem, category, bodyMarkId, bodyModificationId, cosmeticProcedureId } = link;
    const categoryId = category?.id ?? "uncategorized";
    const categoryName = category?.name ?? "Uncategorized";
    const groupName = category?.group?.name ?? "";
    const entityId = bodyMarkId ?? bodyModificationId ?? cosmeticProcedureId ?? null;
    const key = `${categoryId}::${entityId ?? ""}`;

    const variants = (mediaItem.variants ?? {}) as PhotoVariants;
    const url =
      (variants.gallery_512 ? buildUrl(variants.gallery_512) : null) ??
      (variants.view_1200 ? buildUrl(variants.view_1200) : null) ??
      (variants.master_4000 ? buildUrl(variants.master_4000) : null) ??
      (variants.original ? buildUrl(variants.original) : null) ??
      (mediaItem.fileRef ? buildUrl(mediaItem.fileRef) : "");

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        categoryId,
        categoryName,
        groupName,
        entityId,
        entityLabel: null,
        photos: [],
      });
    }
    groupMap.get(key)!.photos.push({
      id: mediaItem.id,
      filename: mediaItem.filename,
      url,
      originalWidth: mediaItem.originalWidth,
      originalHeight: mediaItem.originalHeight,
      focalX: mediaItem.focalX,
      focalY: mediaItem.focalY,
    });
  }

  return Array.from(groupMap.values());
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
