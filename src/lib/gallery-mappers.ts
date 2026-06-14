// Pure gallery-item mappers — client-safe.
//
// Phase 2 of the multi-builder consolidation. This module deliberately
// has NO server-only dependencies: no Prisma, no Sharp, no MinIO clients,
// no AsyncLocalStorage. That makes it the canonical shared mapper between
// server data builders (in media-service.ts) AND client components (e.g.
// media-manager.tsx) — neither side ends up dragging server modules into
// the other's bundle.
//
// The `mapMediaItemToGalleryItem` mapper that takes raw Prisma rows
// (with `variants` JSON + `fileRef`) stays in media-service.ts because
// it calls `buildPhotoUrls` which depends on tenant context. The
// "pre-resolved" `toGalleryItem` mapper here only takes already-built
// `MediaItemWithLinks` (urls field already populated by the caller), so
// it stays pure.

import type { GalleryItem, PersonMediaUsage, PhotoUrls } from "@/lib/types";

// ─── MediaItemWithLinks ──────────────────────────────────────────────────────
//
// Re-homed here from media-service.ts. Type only — no runtime code. Both
// server services (which produce these) and client components (which
// consume them as props) import this type directly without crossing the
// client/server boundary.

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
    bodyRegion: string | null;
    bodyRegions: string[];
    bodyMarkId: string | null;
    bodyModificationId: string | null;
    cosmeticProcedureId: string | null;
    categoryId: string | null;
    eraId: string | null;
    isFavorite: boolean;
    sortOrder: number;
    notes: string | null;
  }[];
  collectionIds: string[];
  skillEventIds: string[];
  setCount: number;
  sourceVideoRef: string | null;
  sourceTimecodeMs: number | null;
  // Provenance for "copy production image → reference session" copies.
  // Reference-session views render this as a "from [SetName]" chip in the
  // lightbox info panel.
  copiedFrom: {
    mediaItemId: string;
    setId: string | null;
    setTitle: string | null;
  } | null;
};

// ─── toGalleryItem ───────────────────────────────────────────────────────────
//
// Pure mapper: pre-resolved MediaItemWithLinks → GalleryItem. Every server
// builder and every client component that needs the conversion should call
// THIS function — single source of truth for the field assignment.

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
    copiedFrom: item.copiedFrom,
  };
}
