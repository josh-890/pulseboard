"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import type { GalleryItem } from "@/lib/types";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext, ProductionContext } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";

type SessionProductionGalleryProps = {
  items: GalleryItem[];
  sessionId?: string;
  productionContext?: ProductionContext;
};

export function SessionProductionGallery({ items, sessionId, productionContext }: SessionProductionGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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

  const collectionContext = useMemo<CollectionContext | undefined>(
    () => collections.length > 0 ? { collections } : undefined,
    [collections],
  );

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [items]);

  return (
    <div ref={containerRef} className="relative">
      {items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground/70">No media items in this session.</p>
      ) : (
        <JustifiedGrid
          items={items}
          draggable
          onOpen={(id) => {
            const idx = indexMap.get(id);
            if (idx !== undefined) setLightboxIndex(idx);
          }}
        />
      )}

      {/* Headless upload engine */}
      {sessionId && (
        <BatchUploadZone
          sessionId={sessionId}
          hideDropzone
          addFilesRef={addFilesRef}
        />
      )}

      {/* Drag-anywhere overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-entity-session/50 bg-entity-session/5 backdrop-blur-[2px] transition-all">
          <div className="flex flex-col items-center gap-2">
            <Upload size={28} className="text-entity-session/60" />
            <p className="text-sm font-medium text-entity-session/80">Drop to upload</p>
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onFindSimilar={(mediaItemId) => window.open(`/media/similar?id=${mediaItemId}`, "_blank")}
          sessionId={sessionId}
          productionContext={productionContext}
          collectionContext={collectionContext}
        />
      )}
    </div>
  );
}

/** Compact upload button for use in section card headers — self-contained, finds file input on click */
export function SessionUploadButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[type="file"][accept*="image"]',
        );
        input?.click();
      }}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-card/60 text-muted-foreground transition-all hover:border-entity-session/30 hover:bg-entity-session/10 hover:text-entity-session focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Upload photos"
      title="Upload photos"
    >
      <Plus size={14} />
    </button>
  );
}
