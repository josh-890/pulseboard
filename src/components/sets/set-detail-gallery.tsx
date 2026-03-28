"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderSearch, Plus, Upload } from "lucide-react";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext, ProductionContext } from "@/components/gallery/gallery-lightbox";
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
  productionContext?: ProductionContext;
};

export function SetDetailGallery({
  items: initialItems,
  entityId,
  primarySessionId,
  coverMediaItemId: initialCoverId,
  productionContext,
}: SetDetailGalleryProps) {
  const [coverId, setCoverId] = useState(initialCoverId ?? null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const addFilesRef = useRef<((files: FileList | File[]) => void) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/collections/list")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => setCollections(data))
      .catch(() => {});
  }, []);

  // Drag-anywhere overlay
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes("Files")) setIsDragOver(true);
    }
    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    }
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer?.files.length) addFilesRef.current?.(e.dataTransfer.files);
    }

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
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
    <div ref={containerRef} className="relative">
      {items.length > 0 && (
        <JustifiedGrid
          items={items}
          onOpen={(id) => {
            const idx = indexMap.get(id);
            if (idx !== undefined) setLightboxIndex(idx);
          }}
        />
      )}

      {/* Action bar */}
      <div className="mt-3 flex items-center gap-2">
        {primarySessionId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>(
                'input[type="file"][accept*="image"]',
              );
              input?.click();
            }}
          >
            <Plus size={14} />
            Upload
          </Button>
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

      {/* Headless upload engine */}
      {primarySessionId && (
        <BatchUploadZone
          sessionId={primarySessionId}
          setId={entityId}
          hideDropzone
          addFilesRef={addFilesRef}
        />
      )}

      {/* Drag-anywhere overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-entity-set/50 bg-entity-set/5 backdrop-blur-[2px] transition-all">
          <div className="flex flex-col items-center gap-2">
            <Upload size={28} className="text-entity-set/60" />
            <p className="text-sm font-medium text-entity-set/80">Drop to upload</p>
          </div>
        </div>
      )}

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
          productionContext={productionContext}
          collectionContext={collectionContext}
        />
      )}
    </div>
  );
}
