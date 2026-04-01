"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Film, FolderSearch, GripVertical, Plus, Trash2, Upload, X } from "lucide-react";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { SortableGallery } from "@/components/gallery/sortable-gallery";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { CollectionContext, ProductionContext } from "@/components/gallery/gallery-lightbox";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import { MediaPickerSheet } from "@/components/sets/media-picker-sheet";
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
import { setSetCover, deleteSetMediaAction, reorderSetMediaAction } from "@/lib/actions/set-actions";
import type { GalleryItem } from "@/lib/types";
import { applyGallerySort, GALLERY_SORT_OPTIONS } from "@/lib/gallery-sort";
import type { GallerySortMode } from "@/lib/gallery-sort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClipGroup = {
  ref: string | null;
  items: GalleryItem[];
};

type SetDetailGalleryProps = {
  items: GalleryItem[];
  entityId: string;
  primarySessionId?: string;
  coverMediaItemId?: string | null;
  productionContext?: ProductionContext;
  setType?: "photo" | "video";
};

export function SetDetailGallery({
  items: initialItems,
  entityId,
  primarySessionId,
  coverMediaItemId: initialCoverId,
  productionContext,
  setType,
}: SetDetailGalleryProps) {
  const [coverId, setCoverId] = useState(initialCoverId ?? null);
  const [localItems, setLocalItems] = useState(initialItems);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isReordering, setIsReordering] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>(() => {
    if (typeof window === "undefined") return "user";
    return (localStorage.getItem("gallery_sort_set") as GallerySortMode) ?? "user";
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [, startTransition] = useTransition();
  const dragCounterRef = useRef(0);
  const addFilesRef = useRef<((files: FileList | File[]) => void) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local items when server re-renders with new data
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

  // Merge cover flag into local items, then apply sort
  const items = useMemo(
    () => applyGallerySort(
      localItems.map((item) => ({ ...item, isCover: item.id === coverId })),
      sortMode,
    ),
    [localItems, coverId, sortMode],
  );

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [items]);

  // For video sets: group items by sourceVideoRef, sorted by timecode within each group
  const isVideoSet = setType === "video";
  const clipGroups = useMemo<ClipGroup[]>(() => {
    if (!isVideoSet) return [];
    const hasAnyRef = items.some((i) => i.sourceVideoRef);
    if (!hasAnyRef) return [{ ref: null, items: [...items] }];

    const groupMap = new Map<string, GalleryItem[]>();
    const ungrouped: GalleryItem[] = [];
    for (const item of items) {
      if (item.sourceVideoRef) {
        const group = groupMap.get(item.sourceVideoRef) ?? [];
        group.push(item);
        groupMap.set(item.sourceVideoRef, group);
      } else {
        ungrouped.push(item);
      }
    }
    const groups: ClipGroup[] = [];
    for (const [ref, groupItems] of groupMap) {
      const sorted = [...groupItems].sort(
        (a, b) => (a.sourceTimecodeMs ?? Infinity) - (b.sourceTimecodeMs ?? Infinity),
      );
      groups.push({ ref, items: sorted });
    }
    if (ungrouped.length > 0) groups.push({ ref: null, items: ungrouped });
    return groups;
  }, [isVideoSet, items]);

  const handleSetCover = useCallback(
    (mediaItemId: string | null) => {
      setCoverId(mediaItemId);
      setSetCover(entityId, mediaItemId);
    },
    [entityId],
  );

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
    // Optimistic: remove from local items + clear selection
    setLocalItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
    clearSelection();
    startTransition(async () => {
      await deleteSetMediaAction(entityId, primarySessionId ?? "", idsToDelete);
    });
  }, [selectedIds, entityId, primarySessionId, clearSelection]);

  const handleLightboxDelete = useCallback((id: string) => {
    setLocalItems((prev) => prev.filter((it) => it.id !== id));
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      // After removing, check if there are items left
      return null; // lightbox will handle gracefully via item === undefined check
    });
    startTransition(async () => {
      await deleteSetMediaAction(entityId, primarySessionId ?? "", [id]);
    });
  }, [entityId, primarySessionId]);

  const handleReorder = useCallback((orderedIds: string[]) => {
    const idSet = new Map(localItems.map((it) => [it.id, it]));
    setLocalItems(orderedIds.map((id) => idSet.get(id)).filter((it): it is GalleryItem => it !== undefined));
    startTransition(async () => {
      await reorderSetMediaAction(entityId, orderedIds);
    });
  }, [localItems, entityId]);

  const handleSortChange = useCallback((mode: GallerySortMode) => {
    setSortMode(mode);
    localStorage.setItem("gallery_sort_set", mode);
    if (mode !== "user") setIsReordering(false);
  }, []);

  const collectionContext = useMemo<CollectionContext | undefined>(
    () => collections.length > 0 ? { collections } : undefined,
    [collections],
  );

  const hasSelection = selectedIds.size > 0;

  return (
    <div ref={containerRef} className="relative">
      {items.length > 0 && (
        isReordering
          ? <SortableGallery
              items={items}
              onReorder={handleReorder}
              onOpen={(id) => {
                const idx = indexMap.get(id);
                if (idx !== undefined) setLightboxIndex(idx);
              }}
            />
          : isVideoSet && clipGroups.length > 0
            ? clipGroups.map((group) => (
                <div key={group.ref ?? "__ungrouped"} className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <Film size={13} className="text-violet-400 shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground truncate">
                      {group.ref ?? "No clip name"}
                    </span>
                    <span className="text-xs text-muted-foreground/60 shrink-0">
                      ({group.items.length} {group.items.length === 1 ? "frame" : "frames"})
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <JustifiedGrid
                    items={group.items}
                    selectable
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                    onOpen={(id) => {
                      const idx = indexMap.get(id);
                      if (idx !== undefined) setLightboxIndex(idx);
                    }}
                  />
                </div>
              ))
            : <JustifiedGrid
                items={items}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onOpen={(id) => {
                  const idx = indexMap.get(id);
                  if (idx !== undefined) setLightboxIndex(idx);
                }}
              />
      )}

      {/* Action bar */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {hasSelection ? (
          <>
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 size={14} />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={clearSelection}
            >
              <X size={14} />
              Clear
            </Button>
          </>
        ) : (
          <>
            {primarySessionId && !isReordering && (
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
            {!isReordering && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPickerOpen(true)}
              >
                <FolderSearch size={14} />
                Browse & Add
              </Button>
            )}
            <Select value={sortMode} onValueChange={handleSortChange}>
              <SelectTrigger className="h-7 w-[130px] text-xs gap-1 ml-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GALLERY_SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {items.length > 1 && sortMode === "user" && (
              <Button
                variant={isReordering ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setIsReordering((v) => !v)}
              >
                <GripVertical size={14} />
                {isReordering ? "Done" : "Reorder"}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Headless upload engine */}
      {primarySessionId && (
        <BatchUploadZone
          sessionId={primarySessionId}
          setId={entityId}
          hideDropzone
          addFilesRef={addFilesRef}
          videoSetMode={isVideoSet}
        />
      )}

      {/* Drag-anywhere overlay */}
      {isDragOver && !isReordering && (
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
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onSetCover={handleSetCover}
          coverMediaItemId={coverId}
          onFindSimilar={(mediaItemId) => window.open(`/media/similar?id=${mediaItemId}`, "_blank")}
          onDelete={handleLightboxDelete}
          sessionId={primarySessionId}
          productionContext={productionContext}
          collectionContext={collectionContext}
        />
      )}
    </div>
  );
}
