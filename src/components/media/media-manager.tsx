"use client";

import { useCallback, useMemo, useState } from "react";
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
  const [items, setItems] = useState(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  return (
    <>
      <div className="flex gap-4">
        {/* Grid area */}
        <div className={cn("flex-1 min-w-0", showPanel && selectedIds.size > 0 && "pr-0")}>
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
              {selectedIds.size > 0 && (
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
            onOpen={handleOpen}
          />
        </div>

        {/* Side panel */}
        {showPanel && selectedIds.size > 0 && (
          <div className="hidden w-[320px] shrink-0 lg:block">
            <div className="sticky top-4 rounded-2xl border border-white/20 bg-card/70 shadow-md backdrop-blur-sm max-h-[calc(100vh-8rem)] overflow-y-auto">
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
            </div>
          </div>
        )}
      </div>

      {/* Selection bar (batch actions) */}
      <MediaSelectionBar
        selectedIds={selectedIds}
        personId={personId}
        sessionId={sessionId}
        collections={collections}
        onClearSelection={clearSelection}
      />

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
