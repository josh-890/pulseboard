"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { GalleryItem } from "@/lib/types";

// ADR-0019: the global Favorite Images gallery view. Reuses the justified grid +
// lightbox; the lightbox self-handles the favorite toggle (no onFavoriteToggle
// needed). On close we refresh so just-unfavorited items leave the grid.
export function FavoritesGallery({ items }: { items: GalleryItem[] }) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  function openById(id: string) {
    const idx = items.findIndex((it) => it.id === id);
    if (idx >= 0) setLightboxIndex(idx);
  }

  return (
    <>
      <JustifiedGrid items={items} onOpen={openById} />
      {lightboxIndex !== null && (
        <GalleryLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => {
            setLightboxIndex(null);
            router.refresh();
          }}
          enableCollections
        />
      )}
    </>
  );
}
