"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PanelRight, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import { MediaGrid } from "./media-grid";
import { MediaMetadataPanel } from "./media-metadata-panel";
import { MediaLightbox } from "./media-lightbox";
import { MediaSelectionBar } from "./media-selection-bar";

type EntityOption = { id: string; name: string };

type MediaManagerProps = {
  items: MediaItemWithLinks[];
  personId: string;
  sessionId: string;
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
};

export function MediaManager({
  items: initialItems,
  personId,
  sessionId,
  slotLabels,
  collections,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
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
  const [showPanel, setShowPanel] = useState(true);

  // Build flat index map for lightbox
  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.id, i));
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
        const rangeIds = items.slice(start, end + 1).map((item) => item.id);

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
    [lastSelectedId, indexMap, items],
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

  const handleBatchComplete = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleItemsChange = useCallback(
    (updatedItems: MediaItemWithLinks[]) => {
      setItems((prev) => {
        const updateMap = new Map(updatedItems.map((item) => [item.id, item]));
        return prev.map((item) => updateMap.get(item.id) ?? item);
      });
    },
    [],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  if (items.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground/70">
        No media in this session.
      </p>
    );
  }

  const hasSelection = selectedIds.size > 0;
  const panelVisible = showPanel && hasSelection;
  const previewItem = selectedItems.length === 1 ? selectedItems[0] : null;

  return (
    <>
      <div className="flex gap-4">
        {/* Grid area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
              {hasSelection && (
                <span className="ml-1.5 text-foreground">
                  ({selectedIds.size} selected)
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setShowPanel((p) => !p)}
              className={cn(
                "rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                showPanel && "text-primary",
              )}
              aria-label={showPanel ? "Hide panel" : "Show panel"}
            >
              {showPanel ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
            </button>
          </div>

          <MediaGrid
            items={items}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onToggleSelect={handleToggleSelect}
            onOpen={handleOpen}
          />
        </div>

        {/* Side panel (desktop) */}
        {panelVisible && (
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
                bodyMarks={bodyMarks}
                bodyModifications={bodyModifications}
                cosmeticProcedures={cosmeticProcedures}
                onItemsChange={handleItemsChange}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet when selected (portaled to escape backdrop-blur stacking context) */}
      {panelVisible && createPortal(
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 max-h-[40vh] overflow-y-auto rounded-t-xl border-t border-white/15 bg-card/95 backdrop-blur-md shadow-lg">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-4 py-2 border-b border-white/10">
            <span className="text-xs font-medium">
              {selectedIds.size === 1 ? "Photo Info" : `${selectedIds.size} selected`}
            </span>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
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
            bodyMarks={bodyMarks}
            bodyModifications={bodyModifications}
            cosmeticProcedures={cosmeticProcedures}
            onItemsChange={handleItemsChange}
          />
        </div>,
        document.body,
      )}

      {/* Selection bar (batch actions — portaled to escape backdrop-blur stacking context) */}
      {createPortal(
        <MediaSelectionBar
          selectedIds={selectedIds}
          personId={personId}
          sessionId={sessionId}
          collections={collections}
          onClearSelection={clearSelection}
          onBatchComplete={handleBatchComplete}
        />,
        document.body,
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <MediaLightbox
          items={items}
          currentIndex={lightboxIndex}
          personId={personId}
          sessionId={sessionId}
          slotLabels={slotLabels}
          collections={collections}
          bodyMarks={bodyMarks}
          bodyModifications={bodyModifications}
          cosmeticProcedures={cosmeticProcedures}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onItemsChange={handleItemsChange}
        />
      )}
    </>
  );
}
