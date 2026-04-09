"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import type { GalleryItem } from "@/lib/types";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext, ProductionContext } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteMediaItemsAction } from "@/lib/actions/media-actions";
import { setSessionCover } from "@/lib/actions/session-actions";
import { applyGallerySort, GALLERY_SORT_OPTIONS } from "@/lib/gallery-sort";
import type { GallerySortMode } from "@/lib/gallery-sort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SessionProductionGalleryProps = {
  items: GalleryItem[];
  sessionId?: string;
  coverMediaItemId?: string | null;
  productionContext?: ProductionContext;
};

export function SessionProductionGallery({ items: initialItems, sessionId, coverMediaItemId: initialCoverId, productionContext }: SessionProductionGalleryProps) {
  const [localItems, setLocalItems] = useState(initialItems);
  const [coverId, setCoverId] = useState(initialCoverId ?? null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<GallerySortMode>(() => {
    if (typeof window === "undefined") return "newest";
    return (localStorage.getItem("gallery_sort_session") as GallerySortMode) ?? "newest";
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [, startTransition] = useTransition();
  const dragCounterRef = useRef(0);
  const addFilesRef = useRef<((files: FileList | File[]) => void) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalItems(initialItems);
  }, [initialItems]);

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

  const displayItems = useMemo(() => applyGallerySort(localItems, sortMode), [localItems, sortMode]);

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    displayItems.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [displayItems]);

  const handleSetCover = useCallback((mediaItemId: string | null) => {
    setCoverId(mediaItemId);
    if (sessionId) setSessionCover(sessionId, mediaItemId);
  }, [sessionId]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleDeleteConfirm = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);
    setDeleteDialogOpen(false);
    setLocalItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
    clearSelection();
    startTransition(async () => {
      await deleteMediaItemsAction(idsToDelete, "", sessionId ?? "");
    });
  }, [selectedIds, sessionId, clearSelection]);

  const handleLightboxDelete = useCallback((id: string) => {
    setLocalItems((prev) => prev.filter((it) => it.id !== id));
    setLightboxIndex(null);
    startTransition(async () => {
      await deleteMediaItemsAction([id], "", sessionId ?? "");
    });
  }, [sessionId]);

  const hasSelection = selectedIds.size > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Toolbar */}
      {localItems.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          {hasSelection ? (
            <>
              <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 size={14} />
                Delete
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearSelection}>
                <X size={14} />
                Clear
              </Button>
            </>
          ) : (
            <Select value={sortMode} onValueChange={(v) => { const m = v as GallerySortMode; setSortMode(m); localStorage.setItem("gallery_sort_session", m); }}>
              <SelectTrigger className="h-7 w-[130px] text-xs gap-1 ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_SORT_OPTIONS.filter((o) => o.value !== "user").map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {displayItems.length === 0 ? (
        <p className="text-sm italic text-muted-foreground/70">No media items in this session.</p>
      ) : (
        <JustifiedGrid
          items={displayItems}
          selectable
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
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

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} {selectedIds.size === 1 ? "item" : "items"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {selectedIds.size === 1 ? "file" : "files"} and all
              associated metadata. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={displayItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSetCover={handleSetCover}
          coverMediaItemId={coverId}
          onFindSimilar={(mediaItemId) => window.open(`/media/similar?id=${mediaItemId}`, "_blank")}
          onDelete={handleLightboxDelete}
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
