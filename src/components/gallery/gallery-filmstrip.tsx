"use client";

import { useEffect, useRef } from "react";
import { cn, focalStyle } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";

type GalleryFilmstripProps = {
  items: GalleryItem[];
  activeIndex: number;
  onNavigate: (index: number) => void;
};

export function GalleryFilmstrip({
  items,
  activeIndex,
  onNavigate,
}: GalleryFilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex]);

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/40 px-4 py-2">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scroll-smooth scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {items.map((item, i) => {
          const isActive = i === activeIndex;
          const aspectRatio = item.originalWidth / item.originalHeight;
          const thumbUrl =
            item.urls.profile_128 ?? item.urls.gallery_512 ?? item.urls.original ?? "";

          return (
            <button
              key={item.id}
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onNavigate(i)}
              className={cn(
                "shrink-0 rounded-md overflow-hidden transition-all duration-150",
                isActive
                  ? "ring-2 ring-primary scale-105 opacity-100"
                  : "opacity-50 hover:opacity-80",
              )}
              style={{
                height: 56,
                width: Math.round(56 * Math.max(aspectRatio, 0.5)),
                scrollSnapAlign: "center",
              }}
              aria-label={`View image ${i + 1}`}
              aria-current={isActive ? "true" : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl}
                alt=""
                className="h-full w-full object-cover"
                style={focalStyle(item.focalX, item.focalY)}
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
