"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import type { MediaItemWithUrls } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import { assignHeadshotSlot, removeHeadshotSlot } from "@/lib/actions/media-actions";
import { cn } from "@/lib/utils";

type SessionMediaGalleryProps = {
  items: MediaItemWithUrls[];
  personId?: string;
  slotLabels?: ProfileImageLabel[];
  existingSlots?: Record<string, number>;
};

const GAP = 8;
const TARGET_ROW_HEIGHT = 220;
const MAX_ROW_HEIGHT = 280;
const MIN_ROW_HEIGHT = 160;
const MOBILE_TARGET = 160;

type RowLayout = {
  items: MediaItemWithUrls[];
  height: number;
};

function computeRows(
  items: MediaItemWithUrls[],
  containerWidth: number,
  targetHeight: number,
): RowLayout[] {
  if (containerWidth <= 0 || items.length === 0) return [];

  const rows: RowLayout[] = [];
  let currentRow: MediaItemWithUrls[] = [];
  let currentRatioSum = 0;

  for (const item of items) {
    const aspect = item.originalWidth / (item.originalHeight || 1);
    currentRow.push(item);
    currentRatioSum += aspect;

    const availableWidth = containerWidth - GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;

    if (rowHeight <= targetHeight) {
      const clampedHeight = Math.max(
        MIN_ROW_HEIGHT,
        Math.min(MAX_ROW_HEIGHT, rowHeight),
      );
      rows.push({ items: currentRow, height: clampedHeight });
      currentRow = [];
      currentRatioSum = 0;
    }
  }

  // Last incomplete row — cap at target so it doesn't stretch
  if (currentRow.length > 0) {
    const availableWidth = containerWidth - GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;
    const clampedHeight = Math.min(
      targetHeight,
      Math.max(MIN_ROW_HEIGHT, rowHeight),
    );
    rows.push({ items: currentRow, height: clampedHeight });
  }

  return rows;
}

export function SessionMediaGallery({
  items,
  personId,
  slotLabels,
  existingSlots: existingSlotsProp,
}: SessionMediaGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slotMap, setSlotMap] = useState<Record<string, number>>(existingSlotsProp ?? {});
  const [isPending, startTransition] = useTransition();
  const showSlotBar = !!personId && !!slotLabels && slotLabels.length > 0;

  // Measure container width via ResizeObserver
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
    () => computeRows(items, containerWidth, targetHeight),
    [items, containerWidth, targetHeight],
  );

  // Build flat index map for lightbox
  const flatIndex = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [items]);

  const openLightbox = useCallback(
    (itemId: string) => {
      const idx = flatIndex.get(itemId);
      if (idx !== undefined) setLightboxIndex(idx);
    },
    [flatIndex],
  );

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % items.length : null,
    );
  }, [items.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + items.length) % items.length : null,
    );
  }, [items.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [lightboxIndex, closeLightbox, goNext, goPrev]);

  // Build reverse map: slot → mediaItemId
  const reverseSlotMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const [mediaId, slot] of Object.entries(slotMap)) {
      map.set(slot, mediaId);
    }
    return map;
  }, [slotMap]);

  const handleSlotClick = useCallback(
    (mediaItemId: string, slotNumber: number) => {
      if (!personId) return;

      const currentSlot = slotMap[mediaItemId];
      const isToggleOff = currentSlot === slotNumber;

      // Optimistic update
      setSlotMap((prev) => {
        const next = { ...prev };
        if (isToggleOff) {
          delete next[mediaItemId];
        } else {
          // Clear any other media from this slot
          for (const [id, s] of Object.entries(next)) {
            if (s === slotNumber) delete next[id];
          }
          next[mediaItemId] = slotNumber;
        }
        return next;
      });

      startTransition(async () => {
        if (isToggleOff) {
          await removeHeadshotSlot(personId, mediaItemId);
        } else {
          await assignHeadshotSlot(personId, mediaItemId, slotNumber);
        }
      });
    },
    [personId, slotMap],
  );

  if (items.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground/70">
        No media in this session.
      </p>
    );
  }

  const current = lightboxIndex !== null ? items[lightboxIndex] : null;

  return (
    <>
      <div ref={containerRef} className="w-full">
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="flex"
            style={{ gap: GAP, marginBottom: GAP }}
          >
            {row.items.map((item) => {
              const aspect = item.originalWidth / (item.originalHeight || 1);
              const renderWidth = row.height * aspect;
              const thumbUrl =
                item.urls.gallery_512 || item.urls.original || null;
              if (!thumbUrl) return null;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openLightbox(item.id)}
                  className="group relative shrink-0 cursor-zoom-in overflow-hidden rounded-lg transition-shadow duration-150 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-primary"
                  style={{
                    width: renderWidth,
                    height: row.height,
                  }}
                  aria-label={item.caption ?? item.filename}
                >
                  <Image
                    src={thumbUrl}
                    alt={item.caption ?? item.filename}
                    width={Math.round(renderWidth)}
                    height={Math.round(row.height)}
                    className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                    unoptimized
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Lightbox overlay */}
      {current && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {/* Previous */}
          {items.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Image */}
          <div
            className="relative max-h-[85vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={
                current.urls.gallery_1600 ||
                current.urls.gallery_1024 ||
                current.urls.original ||
                ""
              }
              alt={current.caption ?? current.filename}
              width={current.originalWidth}
              height={current.originalHeight}
              unoptimized
              className="max-h-[85vh] w-auto rounded-lg object-contain"
              priority
            />
            {/* Caption / counter */}
            <div className="mt-3 flex items-center justify-between text-sm text-white/70">
              <span className="truncate">
                {current.caption ?? current.filename}
              </span>
              <span className="ml-3 shrink-0">
                {lightboxIndex + 1} / {items.length}
              </span>
            </div>

            {/* Headshot slot bar */}
            {showSlotBar && (
              <div className="mt-3 flex items-center gap-2">
                <ImageIcon size={14} className="shrink-0 text-white/50" />
                <div className="flex gap-1.5">
                  {slotLabels.map((sl, i) => {
                    const slotNumber = i + 1;
                    const isActive = slotMap[current.id] === slotNumber;
                    const occupiedBy = reverseSlotMap.get(slotNumber);
                    const isOccupiedByOther = occupiedBy !== undefined && occupiedBy !== current.id;
                    return (
                      <button
                        key={sl.slot}
                        type="button"
                        disabled={isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSlotClick(current.id, slotNumber);
                        }}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : isOccupiedByOther
                              ? "bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70"
                              : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
                        )}
                        title={isOccupiedByOther ? `${sl.label} (assigned to another image)` : sl.label}
                        aria-label={`Assign to ${sl.label}`}
                        aria-pressed={isActive}
                      >
                        {sl.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Next */}
          {items.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
