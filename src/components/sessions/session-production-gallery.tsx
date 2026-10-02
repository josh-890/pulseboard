"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, CheckSquare, Layers, Plus, Trash2, Upload, X } from "lucide-react";
import type { GalleryItem } from "@/lib/types";
import type { GalleryCastMember } from "@/lib/types/gallery";
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
import { BulkPeopleShownControl } from "@/components/gallery/bulk-people-shown";
import { BulkTagControls } from "@/components/tags";
import { applyTagChangeToItems } from "@/lib/gallery-tag-update";
import { GroupSelectToggle } from "@/components/gallery/group-select-toggle";
import { PeopleFilterBar } from "@/components/gallery/people-filter-bar";
import { useGallerySelection } from "@/lib/hooks/use-gallery-selection";
import { usePeopleFilter } from "@/lib/hooks/use-people-filter";
import type { PeopleFilter } from "@/lib/gallery-people-filter";
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
  cast?: GalleryCastMember[];
};

export function SessionProductionGallery({ items: initialItems, sessionId, coverMediaItemId: initialCoverId, productionContext, cast }: SessionProductionGalleryProps) {
  const [localItems, setLocalItems] = useState(initialItems);
  const [coverId, setCoverId] = useState(initialCoverId ?? null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>(() => {
    if (typeof window === "undefined") return "newest";
    return (localStorage.getItem("gallery_sort_session") as GallerySortMode) ?? "newest";
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupBySet, setGroupBySet] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("gallery_group_session") === "true";
  });
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

  // People-shown filter (ADR-0023): include / exclude per cast member.
  const {
    filter: peopleFilter,
    setFilter: setPeopleFilter,
    active: filterActive,
    filteredItems,
    filterItems,
  } = usePeopleFilter(displayItems, cast);

  // Group items by their first set link (for "Group by Set" mode)
  const grouped = useMemo(() => {
    if (!groupBySet) return null;
    const setMap = new Map<string, { setId: string; setTitle: string; items: GalleryItem[] }>();
    const sessionOnly: GalleryItem[] = [];
    for (const item of displayItems) {
      if (item.setLinks && item.setLinks.length > 0) {
        const link = item.setLinks[0];
        if (!setMap.has(link.setId)) {
          setMap.set(link.setId, { setId: link.setId, setTitle: link.setTitle, items: [] });
        }
        setMap.get(link.setId)!.items.push(item);
      } else {
        sessionOnly.push(item);
      }
    }
    return { groups: Array.from(setMap.values()), sessionOnly };
  }, [groupBySet, displayItems]);

  const hasSetLinks = displayItems.some((item) => item.setLinks && item.setLinks.length > 0);

  const handleSetCover = useCallback((mediaItemId: string | null) => {
    setCoverId(mediaItemId);
    if (sessionId) setSessionCover(sessionId, mediaItemId);
  }, [sessionId]);

  // The images in the order the grid draws them — what a Shift range, Select all
  // and Invert run over.
  const visibleOrder = useMemo(() => {
    if (filterActive) return filteredItems.map((it) => it.id);
    if (grouped) return [...grouped.groups.flatMap((g) => g.items), ...grouped.sessionOnly].map((it) => it.id);
    return displayItems.map((it) => it.id);
  }, [filterActive, filteredItems, grouped, displayItems]);

  const openInLightbox = useCallback(
    (id: string) => {
      const idx = indexMap.get(id);
      if (idx !== undefined) setLightboxIndex(idx);
    },
    [indexMap],
  );
  const {
    selectedIds,
    toggle: handleToggleSelect,
    tileClick: handleTileClick,
    clear: clearSelection,
    selectAll: selectAllVisible,
    invert: invertSelection,
    toggleGroup,
    groupState,
    pruneToVisible,
  } = useGallerySelection({
    visibleOrder,
    onOpen: openInLightbox,
    keyboardEnabled: lightboxIndex === null && !deleteDialogOpen,
  });

  // A filter change drops what it hides from the selection: a bulk action must
  // never reach an image you can no longer see.
  const handlePeopleFilterChange = useCallback(
    (next: PeopleFilter) => {
      setPeopleFilter(next);
      pruneToVisible(filterItems(displayItems, next).map((it) => it.id));
    },
    [setPeopleFilter, pruneToVisible, filterItems, displayItems],
  );

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
    // The lightbox advances to the next image itself (or closes if it was the last).
    setLocalItems((prev) => prev.filter((it) => it.id !== id));
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
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {selectedIds.size} of {visibleOrder.length} selected
              </span>
              {selectedIds.size < visibleOrder.length && (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={selectAllVisible} title="Select all (Ctrl+A)">
                  <CheckSquare size={14} />
                  Select all
                </Button>
              )}
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={invertSelection}>
                <ArrowLeftRight size={14} />
                Invert
              </Button>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 size={14} />
                Delete
              </Button>
              <BulkTagControls
                entityType="MEDIA_ITEM"
                entityIds={[...selectedIds]}
                onApplied={(change) => setLocalItems((prev) => applyTagChangeToItems(prev, change))}
                hotkeysEnabled={lightboxIndex === null && !deleteDialogOpen}
              />
              {cast && cast.length > 0 && (
                <BulkPeopleShownControl
                  cast={cast}
                  selectedIds={[...selectedIds]}
                  onApplied={(pid, mode) => {
                    const apply = (it: GalleryItem): GalleryItem =>
                      selectedIds.has(it.id)
                        ? {
                            ...it,
                            hiddenPersonIds:
                              mode === "hide"
                                ? [...new Set([...(it.hiddenPersonIds ?? []), pid])]
                                : (it.hiddenPersonIds ?? []).filter((x) => x !== pid),
                          }
                        : it;
                    setLocalItems((prev) => prev.map(apply));
                    // Images the change moved out of the filtered view leave the selection too.
                    if (filterActive) pruneToVisible(filterItems(displayItems.map(apply)).map((it) => it.id));
                  }}
                />
              )}
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={clearSelection} title="Clear selection (Esc)">
                <X size={14} />
                Clear
              </Button>
            </>
          ) : (
            <div className="flex w-full items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={selectAllVisible}
                title="Select all visible images (Ctrl+A) · Shift+click selects a range"
              >
                <CheckSquare size={14} />
                Select all
              </Button>
              <div className="ml-auto" />
              {hasSetLinks && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !groupBySet;
                    setGroupBySet(next);
                    localStorage.setItem("gallery_group_session", String(next));
                  }}
                  title={groupBySet ? "Show flat" : "Group by Set"}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    groupBySet
                      ? "border-entity-session/40 bg-entity-session/15 text-entity-session"
                      : "border-white/15 bg-card/60 text-muted-foreground hover:border-entity-session/30 hover:bg-entity-session/10 hover:text-entity-session"
                  }`}
                >
                  <Layers size={14} />
                </button>
              )}
              <Select value={sortMode} onValueChange={(v) => { const m = v as GallerySortMode; setSortMode(m); localStorage.setItem("gallery_sort_session", m); }}>
                <SelectTrigger className="h-7 w-[130px] text-xs gap-1">
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
            </div>
          )}
        </div>
      )}

      {/* People-shown filter (ADR-0023) — only when the session has ≥2 contributors */}
      {cast && cast.length >= 2 && displayItems.length > 0 && (
        <PeopleFilterBar
          cast={cast}
          items={displayItems}
          visibleItems={filteredItems}
          filter={peopleFilter}
          onChange={handlePeopleFilterChange}
        />
      )}

      {displayItems.length === 0 ? (
        <p className="text-sm italic text-muted-foreground/70">No media items in this session.</p>
      ) : filterActive ? (
        filteredItems.length > 0 ? (
          <JustifiedGrid
            items={filteredItems}
            selectable
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelect={handleTileClick}
            showOpenButton
            onOpen={(id) => {
              const idx = indexMap.get(id);
              if (idx !== undefined) setLightboxIndex(idx);
            }}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No images match this combination of people.
          </p>
        )
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.groups.map((group) => (
            <div key={group.setId}>
              <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-1.5">
                <GroupSelectToggle
                  state={groupState(group.items.map((it) => it.id))}
                  label={group.setTitle}
                  onToggle={() => toggleGroup(group.items.map((it) => it.id))}
                />
                <Layers size={12} className="text-entity-session/60 shrink-0" />
                <Link
                  href={`/sets/${group.setId}`}
                  className="text-sm font-medium text-foreground/80 hover:text-entity-set transition-colors"
                >
                  {group.setTitle}
                </Link>
                <span className="text-xs text-muted-foreground">{group.items.length}</span>
              </div>
              <JustifiedGrid
                items={group.items}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
            onSelect={handleTileClick}
            showOpenButton
                onOpen={(id) => {
                  const idx = indexMap.get(id);
                  if (idx !== undefined) setLightboxIndex(idx);
                }}
              />
            </div>
          ))}
          {grouped.sessionOnly.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-1.5">
                <GroupSelectToggle
                  state={groupState(grouped.sessionOnly.map((it) => it.id))}
                  label="Session only"
                  onToggle={() => toggleGroup(grouped.sessionOnly.map((it) => it.id))}
                />
                <Layers size={12} className="text-muted-foreground/50 shrink-0" />
                <span className="text-sm font-medium text-muted-foreground">Session only</span>
                <span className="text-xs text-muted-foreground">{grouped.sessionOnly.length}</span>
              </div>
              <JustifiedGrid
                items={grouped.sessionOnly}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
            onSelect={handleTileClick}
            showOpenButton
                onOpen={(id) => {
                  const idx = indexMap.get(id);
                  if (idx !== undefined) setLightboxIndex(idx);
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <JustifiedGrid
          items={displayItems}
          selectable
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
            onSelect={handleTileClick}
            showOpenButton
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
          cast={cast}
          onHiddenPersonsChange={(id, hidden) =>
            setLocalItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, hiddenPersonIds: hidden } : it)),
            )
          }
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
