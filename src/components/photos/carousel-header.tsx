"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Lightbox } from "./lightbox";
import { setFavorite } from "@/lib/actions/photo-actions";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type ClientPhoto = Omit<PhotoWithUrls, "variants">;

type CarouselHeaderProps = {
  photos: ClientPhoto[];
  entityType: "person" | "set";
  entityId: string;
  fallbackColor?: string;
  fallbackInitials?: string;
  profileLabels?: ProfileImageLabel[];
  onTagsChanged?: (photoId: string, newTags: string[]) => void;
  width?: number;
  height?: number;
};

export function CarouselHeader({
  photos,
  entityType,
  entityId,
  fallbackColor,
  fallbackInitials,
  profileLabels,
  onTagsChanged,
  width = 200,
  height = 250,
}: CarouselHeaderProps) {
  // Sort so favorite comes first
  const sorted = [...photos].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return a.sortOrder - b.sortOrder;
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleFavoriteToggle = useCallback(
    (photoId: string) => {
      setFavorite({ photoId, entityType, entityId });
    },
    [entityType, entityId],
  );

  // Empty state: show color/initials fallback
  if (sorted.length === 0) {
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

  const current = sorted[activeIndex];
  if (!current) return null;

  const displayUrl =
    current.urls.profile_512 ?? current.urls.profile_768 ?? current.urls.original;

  return (
    <>
      <div
        className="group relative shrink-0 overflow-hidden rounded-2xl"
        style={{ width, height }}
      >
        <button
          type="button"
          onClick={() => setLightboxIndex(activeIndex)}
          className="relative block h-full w-full cursor-zoom-in"
          aria-label="View photo fullscreen"
        >
          <Image
            src={displayUrl}
            alt="Profile photo"
            fill
            className="object-cover object-center"
            unoptimized
            priority
          />
        </button>

        {/* Navigation arrows */}
        {sorted.length > 1 && (
          <>
            {activeIndex > 0 && (
              <button
                type="button"
                onClick={() => setActiveIndex((i) => i - 1)}
                aria-label="Previous photo"
                className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            {activeIndex < sorted.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveIndex((i) => i + 1)}
                aria-label="Next photo"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1 text-white opacity-0 transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}

        {/* Counter badge */}
        {sorted.length > 1 && (
          <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
            {activeIndex + 1}/{sorted.length}
          </span>
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={sorted}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFavoriteToggle={handleFavoriteToggle}
          entityType={entityType}
          entityId={entityId}
          profileLabels={profileLabels}
          onTagsChanged={onTagsChanged}
        />
      )}
    </>
  );
}
