"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import { MediaThumbnail } from "./media-thumbnail";

const GAP = 8;
const TARGET_ROW_HEIGHT = 220;
const MAX_ROW_HEIGHT = 280;
const MIN_ROW_HEIGHT = 160;
const MOBILE_TARGET = 160;

type RowLayout = {
  items: MediaItemWithLinks[];
  height: number;
};

function computeRows(
  items: MediaItemWithLinks[],
  containerWidth: number,
  targetHeight: number,
): RowLayout[] {
  if (containerWidth <= 0 || items.length === 0) return [];

  const rows: RowLayout[] = [];
  let currentRow: MediaItemWithLinks[] = [];
  let currentRatioSum = 0;

  for (const item of items) {
    const aspect = item.originalWidth / (item.originalHeight || 1);
    currentRow.push(item);
    currentRatioSum += aspect;

    const availableWidth = containerWidth - GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;

    if (rowHeight <= targetHeight) {
      const clampedHeight = Math.max(
        MIN_ROW_HEIGHT,
        Math.min(MAX_ROW_HEIGHT, rowHeight),
      );
      rows.push({ items: currentRow, height: clampedHeight });
      currentRow = [];
      currentRatioSum = 0;
    }
  }

  if (currentRow.length > 0) {
    const availableWidth = containerWidth - GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;
    const clampedHeight = Math.min(
      targetHeight,
      Math.max(MIN_ROW_HEIGHT, rowHeight),
    );
    rows.push({ items: currentRow, height: clampedHeight });
  }

  return rows;
}

type MediaGridProps = {
  items: MediaItemWithLinks[];
  selectedIds: Set<string>;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
};

export function MediaGrid({
  items,
  selectedIds,
  onSelect,
  onToggleSelect,
  onOpen,
}: MediaGridProps) {
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
  const isMultiSelectMode = selectedIds.size > 1;

  const rows = useMemo(
    () => computeRows(items, containerWidth, targetHeight),
    [items, containerWidth, targetHeight],
  );

  return (
    <div ref={containerRef} className="w-full">
      {rows.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className="flex"
          style={{ gap: GAP, marginBottom: GAP }}
        >
          {row.items.map((item) => {
            const aspect = item.originalWidth / (item.originalHeight || 1);
            const renderWidth = row.height * aspect;

            return (
              <MediaThumbnail
                key={item.id}
                item={item}
                width={renderWidth}
                height={row.height}
                isSelected={selectedIds.has(item.id)}
                isMultiSelectMode={isMultiSelectMode}
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
