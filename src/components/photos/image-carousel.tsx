"use client";

import { useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhotoWithUrls } from "@/lib/types";

type ImageCarouselProps = {
  photos: PhotoWithUrls[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onImageClick: (index: number) => void;
  onFavoriteToggle: (photoId: string) => void;
};

export function ImageCarousel({
  photos,
  activeIndex,
  onIndexChange,
  onImageClick,
  onFavoriteToggle,
}: ImageCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const children = container.children;
      if (children[index]) {
        isScrolling.current = true;
        (children[index] as HTMLElement).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
        setTimeout(() => {
          isScrolling.current = false;
        }, 400);
      }
    },
    [],
  );

  useEffect(() => {
    scrollToIndex(activeIndex);
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function handleScroll() {
      if (isScrolling.current) return;
      const el = container!;
      const scrollLeft = el.scrollLeft;
      const itemWidth = el.clientWidth;
      const newIndex = Math.round(scrollLeft / itemWidth);
      if (newIndex !== activeIndex && newIndex >= 0 && newIndex < photos.length) {
        onIndexChange(newIndex);
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeIndex, photos.length, onIndexChange]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && activeIndex > 0) {
        onIndexChange(activeIndex - 1);
      } else if (e.key === "ArrowRight" && activeIndex < photos.length - 1) {
        onIndexChange(activeIndex + 1);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, photos.length, onIndexChange]);

  const currentItem = photos[activeIndex];

  return (
    <div className="group relative">
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {photos.map((item, index) => {
          const displayUrl =
            item.urls.gallery_1024 ?? item.urls.gallery_512 ?? item.urls.original;
          return (
            <div
              key={item.id}
              className="w-full shrink-0 snap-start"
            >
              <button
                type="button"
                onClick={() => onImageClick(index)}
                className="relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-2xl"
                aria-label={`View photo ${index + 1} fullscreen`}
              >
                <Image
                  src={displayUrl}
                  alt={item.caption ?? `Photo ${index + 1}`}
                  fill
                  className="object-cover"
                  unoptimized
                  priority={index === 0}
                />
              </button>
            </div>
          );
        })}
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
            disabled={activeIndex === 0}
            aria-label="Previous photo"
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100",
              activeIndex === 0 && "hidden",
            )}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() =>
              onIndexChange(Math.min(photos.length - 1, activeIndex + 1))
            }
            disabled={activeIndex === photos.length - 1}
            aria-label="Next photo"
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white opacity-0 transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100",
              activeIndex === photos.length - 1 && "hidden",
            )}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {photos.length > 1 && (
        <span className="absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-medium text-white">
          {activeIndex + 1} / {photos.length}
        </span>
      )}

      {currentItem && (
        <button
          type="button"
          onClick={() => onFavoriteToggle(currentItem.id)}
          aria-label={currentItem.isFavorite ? "Remove from favorites" : "Set as favorite"}
          className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white transition-all duration-150 hover:bg-black/60"
        >
          <Heart
            size={18}
            className={cn(
              "transition-all duration-150",
              currentItem.isFavorite && "fill-red-500 text-red-500",
            )}
          />
        </button>
      )}
    </div>
  );
}
