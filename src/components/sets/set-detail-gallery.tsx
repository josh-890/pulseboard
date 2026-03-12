"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderSearch } from "lucide-react";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { MediaPickerSheet } from "@/components/sets/media-picker-sheet";
import { Button } from "@/components/ui/button";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/collections/list")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => setCollections(data))
      .catch(() => {});
  }, []);

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

  const collectionContext = useMemo<CollectionContext | undefined>(
    () => collections.length > 0 ? { collections } : undefined,
    [collections],
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
      <div className="space-y-2">
        {primarySessionId && (
          <BatchUploadZone
            sessionId={primarySessionId}
            setId={entityId}
          />
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setPickerOpen(true)}
        >
          <FolderSearch size={14} />
          Browse & Add
        </Button>
      </div>
      <MediaPickerSheet
        setId={entityId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
      {lightboxIndex !== null && (
        <GalleryLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSetCover={handleSetCover}
          coverMediaItemId={coverId}
          onFindSimilar={(mediaItemId) => window.open(`/media/similar?id=${mediaItemId}`, "_blank")}
          sessionId={primarySessionId}
          collectionContext={collectionContext}
        />
      )}
    </>
  );
}
