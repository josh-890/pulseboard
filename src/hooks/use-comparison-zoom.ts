"use client";

import { useCallback, useRef, useState } from "react";
import { ZOOM_RESET, panBy, toggleZoomAt, type ZoomState } from "@/lib/comparison-zoom";

const CLICK_SLOP_PX = 5;

/**
 * Click-to-zoom + drag-to-pan for the comparison viewer. `frameProps` goes on the
 * element that is the zoom frame — each cell (synchronized zoom: one state for all
 * cells, so a click in any cell zooms every cell to the same spot) or the whole row.
 * A press that moves less than a few pixels is a click: zoom in there, or back out.
 */
export function useComparisonZoom() {
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_RESET);
  const drag = useRef<{ x: number; y: number; start: ZoomState; moved: boolean; w: number; h: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      drag.current = { x: e.clientX, y: e.clientY, start: zoom, moved: false, w: rect.width, h: rect.height };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [zoom],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
    d.moved = true;
    if (d.start.scale > 1) setZoom(panBy(d.start, dx / d.w, dy / d.h));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setZoom((z) => toggleZoomAt(z, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height));
  }, []);

  const reset = useCallback(() => setZoom(ZOOM_RESET), []);

  return {
    zoom,
    zoomed: zoom.scale > 1,
    reset,
    frameProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => (drag.current = null) },
  };
}
