"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronDown, ChevronRight, GripVertical, Layers, PanelRightClose, Trash2 } from "lucide-react";
import { focalStyle } from "@/lib/utils";
import type { EntityPhotoGroup } from "@/lib/services/media-service";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import type { GalleryItem, PersonMediaLinkSummary } from "@/lib/types";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";
import { assignHeadshotSlot, deleteMediaItemsAction, reorderPersonMediaAction } from "@/lib/actions/media-actions";
import { applyGallerySort, GALLERY_SORT_OPTIONS } from "@/lib/gallery-sort";
import type { GallerySortMode } from "@/lib/gallery-sort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { ReferenceContext } from "@/components/gallery/gallery-lightbox";
import { SortableGallery } from "@/components/gallery/sortable-gallery";
import { MediaGrid } from "./media-grid";
import { MediaMetadataPanel } from "./media-metadata-panel";

type EntityOption = { id: string; name: string };
type PersonaOption = { id: string; label: string; date: string | null };
type SkillEventOption = { id: string; skillName: string; eventType: string; date: string | null };

type MediaManagerProps = {
  items: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  categories: CategoryWithGroup[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  personas: PersonaOption[];
  skillEvents: SkillEventOption[];
  anchor?: "reference" | "production";
};

function toGalleryItemLocal(item: MediaItemWithLinks): GalleryItem {
  const firstLink = item.links[0];
  return {
    id: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    originalWidth: item.originalWidth,
    originalHeight: item.originalHeight,
    caption: item.caption,
    createdAt: item.createdAt,
    urls: item.urls,
    focalX: item.focalX,
    focalY: item.focalY,
    tags: item.tags,
    isFavorite: firstLink?.isFavorite ?? false,
    sortOrder: firstLink?.sortOrder ?? 0,
    isCover: false,
    links: item.links,
    collectionIds: item.collectionIds,
    skillEventIds: item.skillEventIds,
  };
}

function toEntityGalleryItem(photo: EntityPhotoGroup["photos"][number]): GalleryItem {
  return {
    id: photo.id,
    filename: photo.filename,
    mimeType: "image/webp",
    originalWidth: photo.originalWidth,
    originalHeight: photo.originalHeight,
    caption: null,
    createdAt: new Date(),
    urls: {
      original: photo.url,
      master_4000: null,
      gallery_512: photo.url,
      view_1200: photo.url,
      full_2400: null,
      profile_128: null,
      profile_512: null,
      profile_768: null,
      gallery_1024: null,
      gallery_1600: null,
      profile_256: null,
    },
    focalX: photo.focalX,
    focalY: photo.focalY,
    tags: [],
    isFavorite: false,
    sortOrder: 0,
    isCover: false,
  };
}

export function MediaManager({
  items: initialItems,
  personId,
  sessionId,
  slotLabels,
  collections,
  categories,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  personas,
  skillEvents,
  anchor,
}: MediaManagerProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sync items when server re-renders (after router.refresh())
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>(() => {
    if (typeof window === "undefined") return "user";
    return (localStorage.getItem("gallery_sort_reference") as GallerySortMode) ?? "user";
  });
  const [, startDeleteTransition] = useTransition();
  const [usageFilter, setUsageFilter] = useState<"all" | "general" | "detail">("all");

  // Entity Photos (reference session only)
  const [entityPhotoGroups, setEntityPhotoGroups] = useState<EntityPhotoGroup[]>([]);
  const [entitySectionOpen, setEntitySectionOpen] = useState(true);
  const [entityLightbox, setEntityLightbox] = useState<{ items: GalleryItem[]; initialIndex: number } | null>(null);

  useEffect(() => {
    if (anchor !== "reference") return;
    fetch(`/api/sessions/${sessionId}/entity-photos?personId=${personId}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setEntityPhotoGroups(data as EntityPhotoGroup[]);
      })
      .catch(() => undefined);
  }, [sessionId, personId, anchor]);

  // Filter items by usage type (reference sessions only), then sort
  const filteredItems = useMemo(() => {
    let result = items;
    if (anchor === "reference" && usageFilter !== "all") {
      if (usageFilter === "detail") {
        result = items.filter((item) => item.links.some((l) => l.usage === "DETAIL"));
      } else {
        result = items.filter((item) => !item.links.some((l) => l.usage === "DETAIL"));
      }
    }
    return applyGallerySort(result, sortMode);
  }, [items, usageFilter, anchor, sortMode]);

  // Counts for filter pills
  const filterCounts = useMemo(() => {
    if (anchor !== "reference") return null;
    const detail = items.filter((item) => item.links.some((l) => l.usage === "DETAIL")).length;
    return { all: items.length, general: items.length - detail, detail };
  }, [items, anchor]);

  // Build flat index map for lightbox
  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [filteredItems]);

  // Convert filtered items to GalleryItem[] for the lightbox
  const galleryItems = useMemo(
    () => filteredItems.map(toGalleryItemLocal),
    [filteredItems],
  );

  // Build slot → thumbnail URL map from all items
  const allSlotThumbnails = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of items) {
      for (const link of item.links) {
        if (link.usage === "HEADSHOT" && link.slot != null && !map.has(link.slot)) {
          const url = item.urls.profile_128 ?? item.urls.gallery_512 ?? item.urls.original;
          if (url) map.set(link.slot, url);
        }
      }
    }
    return map;
  }, [items]);

  const handleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.shiftKey && lastSelectedId) {
        // Range select
        const lastIdx = indexMap.get(lastSelectedId) ?? 0;
        const currentIdx = indexMap.get(id) ?? 0;
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        const rangeIds = filteredItems.slice(start, end + 1).map((item) => item.id);

        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const rid of rangeIds) next.add(rid);
          return next;
        });
      } else if (e.metaKey || e.ctrlKey) {
        // Toggle single item
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        // Single select (replace)
        setSelectedIds((prev) => {
          if (prev.size === 1 && prev.has(id)) {
            return new Set<string>();
          }
          return new Set([id]);
        });
      }
      setLastSelectedId(id);
    },
    [lastSelectedId, indexMap, filteredItems],
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastSelectedId(id);
  }, []);

  const handleOpen = useCallback(
    (id: string) => {
      const idx = indexMap.get(id);
      if (idx !== undefined) setLightboxIndex(idx);
    },
    [indexMap],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  // Keyboard shortcuts: 1-9 for slot assignment, Escape to deselect
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Delete/Backspace → open delete confirmation
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        setShowDeleteDialog(true);
        return;
      }

      if (e.key === "Escape" && selectedIds.size > 0) {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Slot assignment: only for single selection
      if (selectedIds.size !== 1) return;
      const digit = parseInt(e.key, 10);
      if (isNaN(digit) || digit < 1 || digit > slotLabels.length) return;

      const selectedId = [...selectedIds][0];
      const item = items.find((it) => it.id === selectedId);
      if (!item) return;

      e.preventDefault();
      const headshotLink = item.links.find((l) => l.usage === "HEADSHOT");
      // Optimistic update: assign slot to selected item + remove HEADSHOT link from old holder
      setItems((prev) =>
        prev.map((it) => {
          if (it.id === selectedId) {
            if (headshotLink) {
              // Update existing link's slot
              return {
                ...it,
                links: it.links.map((l) =>
                  l.usage === "HEADSHOT" ? { ...l, slot: digit } : l,
                ),
              };
            }
            // Add new HEADSHOT link with slot
            return {
              ...it,
              links: [
                ...it.links,
                {
                  id: `temp-HEADSHOT`,
                  usage: "HEADSHOT" as const,
                  slot: digit,
                  bodyRegion: null,
                  bodyRegions: [],
                  bodyMarkId: null,
                  bodyModificationId: null,
                  cosmeticProcedureId: null,
                  categoryId: null,
                  personaId: null,
                  isFavorite: false,
                  sortOrder: 0,
                  notes: null,
                },
              ],
            };
          }
          // Remove HEADSHOT link from any other item that had this slot
          const hadSlot = it.links.some((l) => l.usage === "HEADSHOT" && l.slot === digit);
          if (hadSlot) {
            return {
              ...it,
              links: it.links.filter((l) => !(l.usage === "HEADSHOT" && l.slot === digit)),
            };
          }
          return it;
        }),
      );
      assignHeadshotSlot(personId, selectedId, digit);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedIds, items, slotLabels.length, personId, clearSelection]);

  const handleBatchComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleReorder = useCallback((orderedIds: string[]) => {
    const idMap = new Map(items.map((it) => [it.id, it]));
    setItems(orderedIds.map((id) => idMap.get(id)).filter((it): it is typeof items[number] => it !== undefined));
    startDeleteTransition(async () => {
      await reorderPersonMediaAction(personId, orderedIds);
    });
  }, [items, personId]);

  const handleSortChange = useCallback((mode: GallerySortMode) => {
    setSortMode(mode);
    localStorage.setItem("gallery_sort_reference", mode);
    if (mode !== "user") setIsReordering(false);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);
    setShowDeleteDialog(false);
    // Optimistic: remove from grid + clear selection
    setItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
    clearSelection();
    startDeleteTransition(async () => {
      const result = await deleteMediaItemsAction(idsToDelete, personId, sessionId);
      if (!result.success) {
        // Revert on failure
        router.refresh();
      }
    });
  }, [selectedIds, personId, sessionId, clearSelection, router]);

  const handleItemsChange = useCallback(
    (updatedItems: MediaItemWithLinks[]) => {
      setItems((prev) => {
        const updateMap = new Map(updatedItems.map((item) => [item.id, item]));
        return prev.map((item) => updateMap.get(item.id) ?? item);
      });
    },
    [],
  );

  // Handle link changes from the lightbox (optimistic updates via referenceContext)
  const handleLightboxLinksChange = useCallback(
    (itemId: string, links: PersonMediaLinkSummary[]) => {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, links } : it)),
      );
    },
    [],
  );

  const handleLightboxCollectionIdsChange = useCallback(
    (itemId: string, collIds: string[]) => {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, collectionIds: collIds } : it)),
      );
    },
    [],
  );

  const handleLightboxSkillEventIdsChange = useCallback(
    (itemId: string, ids: string[]) => {
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, skillEventIds: ids } : it)),
      );
    },
    [],
  );

  const handleEntityPhotoDelete = useCallback(
    async (photoId: string) => {
      setEntityPhotoGroups((prev) =>
        prev
          .map((g) => ({ ...g, photos: g.photos.filter((p) => p.id !== photoId) }))
          .filter((g) => g.photos.length > 0),
      );
      setItems((prev) => prev.filter((it) => it.id !== photoId));
      await deleteMediaItemsAction([photoId], personId, sessionId);
    },
    [personId, sessionId],
  );

  const groupedEntityPhotos = useMemo(() => {
    const sectionMap = new Map<string, { categoryName: string; groups: EntityPhotoGroup[] }[]>();
    for (const g of entityPhotoGroups) {
      if (!sectionMap.has(g.groupName)) sectionMap.set(g.groupName, []);
      const cats = sectionMap.get(g.groupName)!;
      let catEntry = cats.find((c) => c.categoryName === g.categoryName);
      if (!catEntry) {
        catEntry = { categoryName: g.categoryName, groups: [] };
        cats.push(catEntry);
      }
      catEntry.groups.push(g);
    }
    return sectionMap;
  }, [entityPhotoGroups]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  // Build referenceContext for the lightbox
  const referenceContext: ReferenceContext = useMemo(
    () => ({
      personId,
      sessionId,
      collections,
      categories,
      bodyMarks,
      bodyModifications,
      cosmeticProcedures,
      personas,
      skillEvents,
      allSlotThumbnails,
      onLinksChange: handleLightboxLinksChange,
      onCollectionIdsChange: handleLightboxCollectionIdsChange,
      onSkillEventIdsChange: handleLightboxSkillEventIdsChange,
    }),
    [personId, sessionId, collections, categories, bodyMarks, bodyModifications, cosmeticProcedures, personas, skillEvents, allSlotThumbnails, handleLightboxLinksChange, handleLightboxCollectionIdsChange, handleLightboxSkillEventIdsChange],
  );

  if (items.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground/70">
        No media in this session.
      </p>
    );
  }

  const hasSelection = selectedIds.size > 0;
  const panelVisible = hasSelection;
  const previewItem = selectedItems.length === 1 ? selectedItems[0] : null;

  return (
    <>
      <div className="flex gap-4">
        {/* Grid area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="mb-3 flex items-center gap-3">
            {!isReordering && filterCounts && filterCounts.detail > 0 && (
              <div className="flex items-center gap-1">
                {(["all", "general", "detail"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setUsageFilter(filter)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      usageFilter === filter
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    {filter === "all" ? "All" : filter === "general" ? "General" : "Detail"}
                    <span className="ml-1 opacity-60">{filterCounts[filter]}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
              {hasSelection && !isReordering && (
                <span className="ml-1.5 text-foreground">
                  ({selectedIds.size} selected)
                </span>
              )}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Select value={sortMode} onValueChange={handleSortChange}>
                <SelectTrigger className="h-7 w-[130px] text-xs gap-1">
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
              {filteredItems.length > 1 && sortMode === "user" && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReordering((v) => !v);
                    if (!isReordering) clearSelection();
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    isReordering
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  <GripVertical size={12} />
                  {isReordering ? "Done" : "Reorder"}
                </button>
              )}
            </div>
          </div>

          {isReordering ? (
            <SortableGallery
              items={galleryItems}
              onReorder={handleReorder}
              onOpen={handleOpen}
            />
          ) : (
            <MediaGrid
              items={filteredItems}
              selectedIds={selectedIds}
              anchor={anchor}
              onSelect={handleSelect}
              onToggleSelect={handleToggleSelect}
              onOpen={handleOpen}
            />
          )}
        </div>

        {/* Side panel (desktop) — always present to prevent grid reflow on selection */}
        <div className="hidden lg:block w-[260px] min-w-[200px]">
          <div className="sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-white/15 bg-muted/30 backdrop-blur-sm">
            {/* Image preview thumbnail */}
            {previewItem && (
              <div className="p-3 border-b border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewItem.urls.gallery_512 ?? previewItem.urls.original ?? ""}
                  alt={previewItem.caption ?? previewItem.filename}
                  className="w-full rounded-lg object-contain max-h-[180px]"
                />
              </div>
            )}
            <MediaMetadataPanel
              items={selectedItems}
              allItems={items}
              personId={personId}
              sessionId={sessionId}
              slotLabels={slotLabels}
              collections={collections}
              categories={categories}
              bodyMarks={bodyMarks}
              bodyModifications={bodyModifications}
              cosmeticProcedures={cosmeticProcedures}
              onItemsChange={handleItemsChange}
              onRequestDelete={() => setShowDeleteDialog(true)}
              onClearSelection={clearSelection}
              onBatchComplete={handleBatchComplete}
            />
          </div>
        </div>
      </div>

      {/* Entity Photos section — reference session only */}
      {anchor === "reference" && entityPhotoGroups.length > 0 && (
        <div className="mt-6 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={() => setEntitySectionOpen((v) => !v)}
            className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {entitySectionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Layers size={14} />
            Entity Photos
            <span className="text-xs font-normal opacity-60">
              {entityPhotoGroups.reduce((sum, g) => sum + g.photos.length, 0)}
            </span>
          </button>
          {entitySectionOpen && (
            <div className="space-y-5">
              {Array.from(groupedEntityPhotos.entries()).map(([groupName, cats]) => (
                <div key={groupName}>
                  {groupName && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {groupName}
                    </p>
                  )}
                  <div className="space-y-3">
                    {cats.map(({ categoryName, groups }) => (
                      <div key={categoryName}>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{categoryName}</p>
                        <div className="space-y-2">
                          {groups.map((g) => {
                            const flatPhotos = g.photos.map(toEntityGalleryItem);
                            return (
                              <div key={`${g.categoryId}::${g.entityId ?? ""}`}>
                                {g.entityLabel && (
                                  <p className="mb-1 text-[11px] italic text-muted-foreground/50">{g.entityLabel}</p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  {g.photos.map((photo, idx) => (
                                    <div key={photo.id} className="group/photo relative">
                                      <button
                                        type="button"
                                        onClick={() => setEntityLightbox({ items: flatPhotos, initialIndex: idx })}
                                        className="block h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-colors hover:border-amber-500/40"
                                      >
                                        <Image
                                          src={photo.url}
                                          alt={photo.filename}
                                          width={64}
                                          height={64}
                                          unoptimized
                                          className="h-full w-full object-cover"
                                          style={focalStyle(photo.focalX, photo.focalY)}
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleEntityPhotoDelete(photo.id)}
                                        className="absolute -right-1 -top-1 hidden rounded-full border border-white/15 bg-card p-0.5 text-muted-foreground shadow-sm transition-colors hover:text-red-400 group-hover/photo:inline-flex"
                                        aria-label="Delete entity photo"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mobile: bottom sheet when selected (portaled to escape backdrop-blur stacking context) */}
      {panelVisible && createPortal(
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 max-h-[40vh] overflow-y-auto rounded-t-xl border-t border-white/15 bg-card/95 backdrop-blur-md shadow-lg">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-4 py-2 border-b border-white/10">
            <span className="text-xs font-medium">
              {selectedIds.size === 1 ? "Photo Info" : `${selectedIds.size} selected`}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Close panel"
            >
              <PanelRightClose size={14} />
            </button>
          </div>
          <MediaMetadataPanel
            items={selectedItems}
            personId={personId}
            sessionId={sessionId}
            slotLabels={slotLabels}
            collections={collections}
            categories={categories}
            bodyMarks={bodyMarks}
            bodyModifications={bodyModifications}
            cosmeticProcedures={cosmeticProcedures}
            onItemsChange={handleItemsChange}
            onRequestDelete={() => setShowDeleteDialog(true)}
            onClearSelection={clearSelection}
            onBatchComplete={handleBatchComplete}
          />
        </div>,
        document.body,
      )}

      {/* Lightbox — now uses unified GalleryLightbox */}
      {lightboxIndex !== null && (
        <GalleryLightbox
          items={galleryItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          profileLabels={slotLabels}
          sessionId={sessionId}
          referenceContext={referenceContext}
        />
      )}

      {/* Entity photo lightbox */}
      {entityLightbox && (
        <GalleryLightbox
          items={entityLightbox.items}
          initialIndex={entityLightbox.initialIndex}
          onClose={() => setEntityLightbox(null)}
          profileLabels={slotLabels}
          sessionId={sessionId}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} media item{selectedIds.size !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the file{selectedIds.size !== 1 ? "s" : ""} and all
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
    </>
  );
}
