"use client";

import { useCallback, useMemo, useState } from "react";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { setSetCover } from "@/lib/actions/set-actions";
import type { GalleryItem } from "@/lib/types";

type SetDetailGalleryProps = {
  items: GalleryItem[];
  entityId: string;
  primarySessionId?: string;
  coverMediaItemId?: string | null;
};

export function SetDetailGallery({
  items: initialItems,
  entityId,
  primarySessionId,
  coverMediaItemId: initialCoverId,
}: SetDetailGalleryProps) {
  const [coverId, setCoverId] = useState(initialCoverId ?? null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Keep cover state in sync with items
  const items = useMemo(
    () =>
      initialItems.map((item) => ({
        ...item,
        isCover: item.id === coverId,
      })),
    [initialItems, coverId],
  );

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [items]);

  const handleSetCover = useCallback(
    (mediaItemId: string | null) => {
      setCoverId(mediaItemId);
      setSetCover(entityId, mediaItemId);
    },
    [entityId],
  );

  return (
    <>
      {items.length > 0 && (
        <JustifiedGrid
          items={items}
          onOpen={(id) => {
            const idx = indexMap.get(id);
            if (idx !== undefined) setLightboxIndex(idx);
          }}
        />
      )}
      {primarySessionId && (
        <BatchUploadZone
          sessionId={primarySessionId}
          setId={entityId}
        />
      )}
      {lightboxIndex !== null && (
        <GalleryLightbox
          mode="simple"
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSetCover={handleSetCover}
          coverMediaItemId={coverId}
          onFindSimilar={(mediaItemId) => window.open(`/media/similar?id=${mediaItemId}`, "_blank")}
        />
      )}
    </>
  );
}
