"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhotoWithUrls } from "@/lib/types";

type ThumbnailStripProps = {
  photos: PhotoWithUrls[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

export function ThumbnailStrip({
  photos,
  activeIndex,
  onSelect,
}: ThumbnailStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const activeEl = itemRefs.current[activeIndex];
    if (activeEl && scrollRef.current) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeIndex]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin"
      role="tablist"
      aria-label="Photo thumbnails"
    >
      {photos.map((item, index) => {
        const thumbUrl =
          item.urls.profile_128 ?? item.urls.profile_256 ?? item.urls.original;
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="tab"
            aria-selected={index === activeIndex}
            aria-label={`Photo ${index + 1}${item.isFavorite ? " (favorite)" : ""}`}
            onClick={() => onSelect(index)}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg transition-all duration-150",
              "h-12 w-12 md:h-[72px] md:w-[72px]",
              index === activeIndex
                ? "scale-105 ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "opacity-70 hover:opacity-100",
            )}
          >
            <Image
              src={thumbUrl}
              alt={`Thumbnail ${index + 1}`}
              width={72}
              height={72}
              className="h-full w-full object-cover"
              unoptimized
            />
            {item.isFavorite && (
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 md:h-5 md:w-5">
                <Star size={10} className="fill-white text-white md:h-3 md:w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
