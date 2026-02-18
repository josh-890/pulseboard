"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Lightbox } from "./lightbox";
import { setFavorite } from "@/lib/actions/photo-actions";
import type { PhotoWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";

type JustifiedGalleryProps = {
  photos: PhotoWithUrls[];
  entityType: "person" | "project";
  entityId: string;
  profileLabels: ProfileImageLabel[];
};

const GAP = 8;
const TARGET_ROW_HEIGHT = 220;
const MAX_ROW_HEIGHT = 280;
const MIN_ROW_HEIGHT = 160;
const MOBILE_TARGET = 160;

type RowLayout = {
  photos: PhotoWithUrls[];
  height: number;
};

function computeRows(
  photos: PhotoWithUrls[],
  containerWidth: number,
  targetHeight: number,
): RowLayout[] {
  if (containerWidth <= 0 || photos.length === 0) return [];

  const rows: RowLayout[] = [];
  let currentRow: PhotoWithUrls[] = [];
  let currentRatioSum = 0;

  for (const photo of photos) {
    const aspect = photo.originalWidth / (photo.originalHeight || 1);
    currentRow.push(photo);
    currentRatioSum += aspect;

    const availableWidth = containerWidth - GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;

    if (rowHeight <= targetHeight) {
      // Row is full — clamp height
      const clampedHeight = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, rowHeight));
      rows.push({ photos: currentRow, height: clampedHeight });
      currentRow = [];
      currentRatioSum = 0;
    }
  }

  // Last incomplete row
  if (currentRow.length > 0) {
    const availableWidth = containerWidth - GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;
    // Don't stretch the last row too tall — cap at target
    const clampedHeight = Math.min(targetHeight, Math.max(MIN_ROW_HEIGHT, rowHeight));
    rows.push({ photos: currentRow, height: clampedHeight });
  }

  return rows;
}

export function JustifiedGallery({
  photos,
  entityType,
  entityId,
  profileLabels,
}: JustifiedGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoTagOverrides, setPhotoTagOverrides] = useState<
    Map<string, string[]>
  >(new Map());

  // Reset overrides when photos prop changes
  const photosRef = useRef(photos);
  useEffect(() => {
    if (photosRef.current !== photos) {
      photosRef.current = photos;
      setPhotoTagOverrides(new Map());
    }
  }, [photos]);

  // Merge overrides with photo data
  const photosWithOverrides = useMemo(() => {
    if (photoTagOverrides.size === 0) return photos;
    return photos.map((p) => {
      const override = photoTagOverrides.get(p.id);
      if (override) return { ...p, tags: override };
      return p;
    });
  }, [photos, photoTagOverrides]);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const isMobile = containerWidth < 640;
  const targetHeight = isMobile ? MOBILE_TARGET : TARGET_ROW_HEIGHT;

  const rows = useMemo(
    () => computeRows(photosWithOverrides, containerWidth, targetHeight),
    [photosWithOverrides, containerWidth, targetHeight],
  );

  // Build flat index map for lightbox
  const flatIndex = useMemo(() => {
    const map = new Map<string, number>();
    photosWithOverrides.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [photosWithOverrides]);

  const handleImageClick = useCallback(
    (photoId: string) => {
      const idx = flatIndex.get(photoId);
      if (idx !== undefined) setLightboxIndex(idx);
    },
    [flatIndex],
  );

  const handleFavoriteToggle = useCallback(
    (photoId: string) => {
      setFavorite({ photoId, entityType, entityId });
    },
    [entityType, entityId],
  );

  const handleTagsChanged = useCallback(
    (photoId: string, newTags: string[]) => {
      setPhotoTagOverrides((prev) => {
        const next = new Map(prev);
        next.set(photoId, newTags);
        return next;
      });
    },
    [],
  );

  return (
    <>
      <div ref={containerRef} className="w-full">
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="flex"
            style={{ gap: GAP, marginBottom: GAP }}
          >
            {row.photos.map((photo) => {
              const aspect = photo.originalWidth / (photo.originalHeight || 1);
              const renderWidth = row.height * aspect;
              const imgSrc =
                photo.urls.gallery_512 ?? photo.urls.original;

              const hasProfileSlot = photo.tags.some((t) =>
                t.startsWith("p-img"),
              );
              const contentTagCount = photo.tags.filter(
                (t) => !t.startsWith("p-img"),
              ).length;

              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => handleImageClick(photo.id)}
                  className="relative shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-shadow duration-150 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-primary"
                  style={{
                    width: renderWidth,
                    height: row.height,
                  }}
                  aria-label={photo.caption ?? "Gallery photo"}
                >
                  <Image
                    src={imgSrc}
                    alt={photo.caption ?? "Gallery photo"}
                    width={Math.round(renderWidth)}
                    height={Math.round(row.height)}
                    className="h-full w-full object-contain"
                    unoptimized
                  />

                  {/* Tag indicator badges */}
                  <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                    {hasProfileSlot && (
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                        aria-label="Has profile slot"
                      >
                        P
                      </span>
                    )}
                    {contentTagCount > 0 && (
                      <span
                        className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-medium text-white backdrop-blur-sm"
                        aria-label={`${contentTagCount} tag${contentTagCount !== 1 ? "s" : ""}`}
                      >
                        {contentTagCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          photos={photosWithOverrides}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFavoriteToggle={handleFavoriteToggle}
          entityType={entityType}
          entityId={entityId}
          profileLabels={profileLabels}
          onTagsChanged={handleTagsChanged}
        />
      )}
    </>
  );
}
