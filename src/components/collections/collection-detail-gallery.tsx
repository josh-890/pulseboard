"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { FolderSearch, ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext } from "@/components/gallery/gallery-lightbox";
import {
  CollectionMediaPickerPanel,
  CollectionMediaPickerSheet,
} from "@/components/collections/collection-media-picker-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addToCollectionAction } from "@/lib/actions/collection-actions";
import type { GalleryItem } from "@/lib/types";

type CollectionDetailGalleryProps = {
  collectionId: string;
  items: GalleryItem[];
};

export function CollectionDetailGallery({
  collectionId,
  items,
}: CollectionDetailGalleryProps) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const isDesktop = useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia("(min-width: 1024px)");
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );

  useEffect(() => {
    fetch("/api/collections/list")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => setCollections(data))
      .catch(() => {});
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("application/x-media-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the drop zone itself (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const mediaItemId = e.dataTransfer.getData("application/x-media-id");
    if (!mediaItemId) return;

    const result = await addToCollectionAction(collectionId, [mediaItemId]);
    if (result.success) {
      toast.success("Added 1 item to collection");
      router.refresh();
    } else {
      toast.error(result.error ?? "Failed to add media");
    }
  }, [collectionId, router]);

  const galleryContent = items.length > 0 ? (
    <div className="space-y-4">
      <JustifiedGrid
        items={items}
        onOpen={(id) => {
          const idx = indexMap.get(id);
          if (idx !== undefined) setLightboxIndex(idx);
        }}
      />
      {!pickerOpen && (
        <div className="flex flex-wrap items-center gap-2">
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
      )}
    </div>
  ) : (
    <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
      <ImageIcon size={32} className="mx-auto mb-3 text-muted-foreground" />
      <p className="mb-4 text-sm text-muted-foreground">
        This collection is empty.
      </p>
      {!pickerOpen && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setPickerOpen(true)}
        >
          <FolderSearch size={14} />
          Browse & Add Media
        </Button>
      )}
    </div>
  );

  return (
    <>
      <div className={cn("flex gap-4", pickerOpen && "flex-col lg:flex-row")}>
        {/* Collection gallery + drop zone */}
        <div
          className={cn("relative min-w-0", pickerOpen ? "flex-1" : "w-full")}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {galleryContent}

          {/* Drop zone overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-2 text-primary">
                <Plus size={32} />
                <p className="text-sm font-medium">Drop to add to collection</p>
              </div>
            </div>
          )}
        </div>

        {/* Inline picker panel — desktop only */}
        {pickerOpen && isDesktop && (
          <div className="flex w-[400px] shrink-0 flex-col rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm max-h-[80vh]">
            <CollectionMediaPickerPanel
              collectionId={collectionId}
              active={pickerOpen}
              onClose={() => setPickerOpen(false)}
              draggable
            />
          </div>
        )}
      </div>

      {/* Sheet fallback — mobile only (JS-gated because Sheet renders as portal) */}
      {!isDesktop && (
        <CollectionMediaPickerSheet
          collectionId={collectionId}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
      )}

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          collectionContext={collectionContext}
        />
      )}
    </>
  );
}
