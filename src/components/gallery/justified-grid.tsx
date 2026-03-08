"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryItem } from "@/lib/types";
import {
  computeRows,
  GALLERY_GAP,
  TARGET_ROW_HEIGHT,
  MOBILE_TARGET,
} from "@/lib/gallery-layout";
import { GalleryThumbnail } from "./gallery-thumbnail";

type JustifiedGridProps = {
  items: GalleryItem[];
  /** Enable selection checkboxes (MediaManager mode) */
  selectable?: boolean;
  selectedIds?: Set<string>;
  /** Enable drag-and-drop on thumbnails */
  draggable?: boolean;
  onSelect?: (id: string, e: React.MouseEvent) => void;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
};

export function JustifiedGrid({
  items,
  selectable,
  selectedIds,
  draggable: isDraggable,
  onSelect,
  onToggleSelect,
  onOpen,
}: JustifiedGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const isMobile = containerWidth < 640;
  const targetHeight = isMobile ? MOBILE_TARGET : TARGET_ROW_HEIGHT;
  const isMultiSelectMode = (selectedIds?.size ?? 0) > 1;

  const rows = useMemo(
    () => computeRows(items, containerWidth, targetHeight),
    [items, containerWidth, targetHeight],
  );

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="flex"
          style={{ gap: GALLERY_GAP, marginBottom: GALLERY_GAP }}
        >
          {row.items.map((item) => {
            const aspect = item.originalWidth / (item.originalHeight || 1);
            const renderWidth = row.height * aspect;

            return (
              <GalleryThumbnail
                key={item.id}
                item={item}
                width={renderWidth}
                height={row.height}
                selectable={selectable}
                isSelected={selectedIds?.has(item.id)}
                isMultiSelectMode={isMultiSelectMode}
                draggable={isDraggable}
                onSelect={onSelect}
                onToggleSelect={onToggleSelect}
                onOpen={onOpen}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
