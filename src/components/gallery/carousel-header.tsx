"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import type { GalleryItem } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import { GalleryLightbox } from "./gallery-lightbox";

/** Canonical headshot shown as the first slide (★ slot, else lowest slot). */
type LeadHeadshot = { id: string; url: string; focalX: number | null; focalY: number | null };

type CarouselHeaderProps = {
  items: GalleryItem[];
  fallbackColor?: string;
  fallbackInitials?: string;
  onFavoriteToggle?: (itemId: string) => void;
  onTagsChanged?: (itemId: string, newTags: string[]) => void;
  onUpdateTags?: (itemId: string, tags: string[]) => Promise<{ success: boolean }>;
  onSetCover?: (mediaItemId: string | null) => void;
  coverMediaItemId?: string | null;
  width?: number;
  height?: number;
  // Pass-through to GalleryLightbox
  sessionId?: string;
  onAssignHeadshot?: (mediaItemId: string, slot: number) => void;
  onRemoveHeadshot?: (mediaItemId: string) => void;
  profileLabels?: ProfileImageLabel[];
  headshotSlotMap?: Map<string, number>;
  onFindSimilar?: (mediaItemId: string) => void;
  /** Canonical headshot — rendered as slide 0, deduped from the gallery items. */
  leadHeadshot?: LeadHeadshot | null;
};

type Slide = { url: string; focalX: number | null; focalY: number | null; item: GalleryItem | null };

export function CarouselHeader({
  items,
  fallbackColor,
  fallbackInitials,
  onFavoriteToggle,
  onTagsChanged,
  onUpdateTags,
  onSetCover,
  coverMediaItemId,
  width = 200,
  height = 250,
  sessionId,
  onAssignHeadshot,
  onRemoveHeadshot,
  profileLabels,
  headshotSlotMap,
  onFindSimilar,
  leadHeadshot,
}: CarouselHeaderProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Gallery photos (favorite first, then sortOrder) minus the lead (avoid showing twice).
  const gallery = [...items]
    .filter((i) => !leadHeadshot || i.id !== leadHeadshot.id)
    .sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.sortOrder - b.sortOrder;
    });

  // The canonical headshot leads; gallery photos follow.
  const slides: Slide[] = [
    ...(leadHeadshot ? [{ url: leadHeadshot.url, focalX: leadHeadshot.focalX, focalY: leadHeadshot.focalY, item: null }] : []),
    ...gallery.map((g) => ({
      url: g.urls.profile_512 ?? g.urls.profile_768 ?? g.urls.original,
      focalX: g.focalX,
      focalY: g.focalY,
      item: g,
    })),
  ];

  if (slides.length === 0) {
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl"
        style={{ width, height, backgroundColor: fallbackColor ?? "#6366f1" }}
      >
        {fallbackInitials ? (
          <span className="text-4xl font-bold text-white">{fallbackInitials}</span>
        ) : (
          <ImageIcon size={48} className="text-white/40" />
        )}
      </div>
    );
  }

  const idx = Math.min(activeIndex, slides.length - 1);
  const current = slides[idx];

  const openLightbox = () => {
    if (current.item) setLightboxIndex(gallery.indexOf(current.item));
    else if (gallery.length > 0) setLightboxIndex(0); // lead headshot isn't in the gallery
  };

  return (
    <>
      <div className="group relative shrink-0 overflow-hidden rounded-2xl" style={{ width, height }}>
        <button
          type="button"
          onClick={openLightbox}
          className="relative block h-full w-full cursor-zoom-in"
          aria-label="View photo fullscreen"
        >
          <Image
            src={current.url}
            alt="Profile photo"
            fill
            className="object-cover"
            style={{
              objectPosition:
                current.focalX != null && current.focalY != null
                  ? `${(current.focalX * 100).toFixed(1)}% ${(current.focalY * 100).toFixed(1)}%`
                  : "center",
            }}
            unoptimized
            priority
          />
        </button>

        {slides.length > 1 && (
          <>
            {idx > 0 && (
              <button
                type="button"
                onClick={() => setActiveIndex(idx - 1)}
                aria-label="Previous photo"
                className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            {idx < slides.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveIndex(idx + 1)}
                aria-label="Next photo"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}

        {slides.length > 1 && (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
            {idx + 1}/{slides.length}
          </span>
        )}

      </div>

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={gallery}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFavoriteToggle={onFavoriteToggle}
          onTagsChanged={onTagsChanged}
          onUpdateTags={onUpdateTags}
          onSetCover={onSetCover}
          coverMediaItemId={coverMediaItemId}
          sessionId={sessionId}
          onAssignHeadshot={onAssignHeadshot}
          onRemoveHeadshot={onRemoveHeadshot}
          profileLabels={profileLabels}
          headshotSlotMap={headshotSlotMap}
          onFindSimilar={onFindSimilar}
          enableCollections
        />
      )}
    </>
  );
}
