"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhotoWithUrls } from "@/lib/types";

type LightboxProps = {
  photos: PhotoWithUrls[];
  initialIndex: number;
  onClose: () => void;
  onFavoriteToggle: (photoId: string) => void;
};

export function Lightbox({
  photos,
  initialIndex,
  onClose,
  onFavoriteToggle,
}: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const overlayRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const item = photos[currentIndex];

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(photos.length - 1, i + 1));
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "ArrowRight":
          goNext();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!item) return null;

  // Use gallery_1024 for display, gallery_1600 for zoom
  const displayUrl =
    item.urls.gallery_1024 ?? item.urls.original;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      tabIndex={-1}
      onClick={handleOverlayClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 outline-none"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close lightbox"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X size={24} />
      </button>

      {currentIndex > 0 && (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous photo"
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {currentIndex < photos.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          aria-label="Next photo"
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <ChevronRight size={28} />
        </button>
      )}

      <div className="relative max-h-[85vh] max-w-[90vw]">
        <Image
          src={displayUrl}
          alt={item.caption ?? `Photo ${currentIndex + 1}`}
          width={item.originalWidth}
          height={item.originalHeight}
          className="max-h-[85vh] w-auto object-contain"
          unoptimized
          priority
        />
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2">
        {item.caption && (
          <p className="max-w-lg text-center text-sm text-white/80">
            {item.caption}
          </p>
        )}
        <div className="flex items-center gap-4">
          {photos.length > 1 && (
            <span className="text-sm text-white/70">
              {currentIndex + 1} / {photos.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => onFavoriteToggle(item.id)}
            aria-label={
              item.isFavorite ? "Remove from favorites" : "Set as favorite"
            }
            className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <Heart
              size={18}
              className={cn(
                item.isFavorite && "fill-red-500 text-red-500",
              )}
            />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
