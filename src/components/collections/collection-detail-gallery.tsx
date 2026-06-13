"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Columns2, FolderSearch, ImageIcon, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext } from "@/components/gallery/gallery-lightbox";
import {
  CollectionMediaPickerPanel,
  CollectionMediaPickerSheet,
} from "@/components/collections/collection-media-picker-sheet";
import { ImageCompareSlider } from "@/components/collections/image-compare-slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addToCollectionAction, reorderCollectionAction } from "@/lib/actions/collection-actions";
import type { CollectionLayout } from "@/lib/services/collection-service";
import type { GalleryItem } from "@/lib/types";

function bestUrl(item: GalleryItem): string {
  return item.urls.full_2400 ?? item.urls.view_1200 ?? item.urls.original;
}

type CollectionDetailGalleryProps = {
  collectionId: string;
  items: GalleryItem[];
  layout: CollectionLayout;
};

export function CollectionDetailGallery({
  collectionId,
  items,
  layout,
}: CollectionDetailGalleryProps) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // Before/after pairs can switch between side-by-side cells and a reveal slider.
  const [compareMode, setCompareMode] = useState<"row" | "slider">("row");

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

  const openLightbox = useCallback((id: string) => {
    const idx = indexMap.get(id);
    if (idx !== undefined) setLightboxIndex(idx);
  }, [indexMap]);

  // Uniform comparison-cell aspect = the average of the items' aspects. Each image
  // is letterboxed (object-contain) into this shared cell so differing ratios line up.
  const commonAspect = useMemo(() => {
    const ratios = items
      .map((i) => (i.originalWidth && i.originalHeight ? i.originalWidth / i.originalHeight : 0))
      .filter((r) => Number.isFinite(r) && r > 0);
    if (ratios.length === 0) return { w: 4, h: 3 };
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return { w: Math.round(avg * 1000), h: 1000 };
  }, [items]);

  const moveItem = useCallback(async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const order = items.map((it) => it.id);
    [order[index], order[target]] = [order[target], order[index]];
    const res = await reorderCollectionAction(collectionId, order);
    if (res.success) router.refresh();
    else toast.error(res.error ?? "Failed to reorder");
  }, [items, collectionId, router]);

  const canSlider = layout === "SIDE_BY_SIDE" && items.length === 2;
  const showSlider = canSlider && compareMode === "slider";

  // SIDE_BY_SIDE = a comparison composite: a row of equal letterboxed cells (2…N),
  // with a reveal-slider mode for pairs and per-cell reorder (before ↔ after).
  const sideBySide = (
    <div className="space-y-3">
      {canSlider && (
        <div className="flex justify-end">
          <div className="flex gap-0.5 rounded-md border border-white/15 bg-background/60 p-0.5">
            {([["row", "Side by side", Columns2], ["slider", "Slider", SlidersHorizontal]] as const).map(
              ([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCompareMode(m)}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
                    compareMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon size={13} /> {label}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {showSlider ? (
        <ImageCompareSlider
          beforeUrl={bestUrl(items[0])}
          afterUrl={bestUrl(items[1])}
          aspectW={commonAspect.w}
          aspectH={commonAspect.h}
          beforeLabel={items[0].caption ?? "Before"}
          afterLabel={items[1].caption ?? "After"}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {items.map((item, i) => (
            <figure key={item.id} className="flex min-w-[180px] flex-1 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => openLightbox(item.id)}
                className="relative block w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 transition-colors hover:border-primary/40"
                style={{ aspectRatio: `${commonAspect.w} / ${commonAspect.h}` }}
              >
                <Image src={bestUrl(item)} alt={item.caption ?? `Item ${i + 1}`} fill unoptimized className="object-contain" />
              </button>
              <figcaption className="flex items-center justify-between gap-1">
                <span className="truncate text-xs text-muted-foreground" title={item.caption ?? undefined}>
                  {item.caption ?? `#${i + 1}`}
                </span>
                <span className="flex shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => moveItem(i, -1)} title="Move earlier" aria-label="Move earlier"
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
                    <ArrowLeft size={13} />
                  </button>
                  <button type="button" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} title="Move later" aria-label="Move later"
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">
                    <ArrowRight size={13} />
                  </button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );

  const galleryContent = items.length > 0 ? (
    <div className="space-y-4">
      {layout === "SIDE_BY_SIDE" ? (
        sideBySide
      ) : (
        <JustifiedGrid items={items} onOpen={openLightbox} />
      )}
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
