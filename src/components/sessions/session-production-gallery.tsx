"use client";

import { useMemo, useState } from "react";
import type { MediaItemWithUrls } from "@/lib/types";
import type { GalleryItem } from "@/lib/types";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";

type SessionProductionGalleryProps = {
  items: MediaItemWithUrls[];
};

function toGalleryItem(item: MediaItemWithUrls): GalleryItem {
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
    tags: [],
    isFavorite: false,
    sortOrder: 0,
    isCover: false,
  };
}

export function SessionProductionGallery({ items }: SessionProductionGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const galleryItems = useMemo(
    () => items.map(toGalleryItem),
    [items],
  );

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    galleryItems.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [galleryItems]);

  if (galleryItems.length === 0) {
    return <p className="text-sm italic text-muted-foreground/70">No media items in this session.</p>;
  }

  return (
    <>
      <JustifiedGrid
        items={galleryItems}
        onOpen={(id) => {
          const idx = indexMap.get(id);
          if (idx !== undefined) setLightboxIndex(idx);
        }}
      />
      {lightboxIndex !== null && (
        <GalleryLightbox
          mode="simple"
          items={galleryItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
