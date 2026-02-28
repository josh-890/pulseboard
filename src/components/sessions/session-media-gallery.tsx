"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { MediaItemWithUrls } from "@/lib/types";

type SessionMediaGalleryProps = {
  items: MediaItemWithUrls[];
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

export function SessionMediaGallery({ items }: SessionMediaGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
