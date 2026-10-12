"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Columns2, Link2, Pencil, SlidersHorizontal, Unlink2, X } from "lucide-react";
import { useComparisonZoom } from "@/hooks/use-comparison-zoom";
import { ComparisonComposite, comparisonShape, type ComparisonZoomMode } from "@/components/collections/comparison-composite";
import { ComparisonComposeTools } from "@/components/collections/comparison-compose-tools";
import { ComparisonFitStage } from "@/components/collections/comparison-fit-stage";
import { ImageCompareSlider } from "@/components/collections/image-compare-slider";
import type { ComparisonSummary } from "@/lib/services/comparison-service";

// The viewer of a comparison collection: a comparison opens like a single photo
// does in a Grid collection — full screen, click to zoom, ←/→ through the
// collection, Esc to close. Zoom is either synchronized (every cell zooms and
// pans to the same spot — compare a detail) or whole (the row as one image),
// key Z. Pairs can switch to the reveal slider (S). Edit (E) turns the same
// view into compose mode; Done/Esc returns.

const ZOOM_MODE_KEY = "comparison.zoomMode";

export type ComparisonLightboxProps = {
  comparisons: ComparisonSummary[];
  openId: string;
  editing: boolean;
  collectionId: string;
  onNavigate: (id: string) => void;
  onEditChange: (editing: boolean) => void;
  onClose: () => void;
};

const chromeButton =
  "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export function ComparisonLightbox({
  comparisons,
  openId,
  editing,
  collectionId,
  onNavigate,
  onEditChange,
  onClose,
}: ComparisonLightboxProps) {
  const index = Math.max(0, comparisons.findIndex((c) => c.id === openId));
  const comparison = comparisons[index];
  const { zoom, zoomed, reset, frameProps } = useComparisonZoom();
  const [zoomMode, setZoomMode] = useState<ComparisonZoomMode>(() => {
    try {
      return window.localStorage.getItem(ZOOM_MODE_KEY) === "whole" ? "whole" : "synced";
    } catch {
      return "synced";
    }
  });
  const [viewMode, setViewMode] = useState<"row" | "slider">("row");
  const [sheetOpen, setSheetOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const canSlider = comparison?.members.length === 2;
  const showSlider = canSlider && viewMode === "slider" && !editing;

  const go = useCallback(
    (dir: -1 | 1) => {
      const next = comparisons[index + dir];
      if (!next) return;
      reset();
      onNavigate(next.id);
    },
    [comparisons, index, onNavigate, reset],
  );

  const toggleZoomMode = useCallback(() => {
    reset();
    setZoomMode((m) => {
      const next = m === "synced" ? "whole" : "synced";
      try {
        window.localStorage.setItem(ZOOM_MODE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [reset]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (sheetOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editing) onEditChange(false);
        else if (zoomed) reset();
        else onClose();
        return;
      }
      if (editing) return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          go(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          go(1);
          break;
        case "z":
        case "Z":
          toggleZoomMode();
          break;
        case "s":
        case "S":
          if (canSlider) {
            reset();
            setViewMode((m) => (m === "row" ? "slider" : "row"));
          }
          break;
        case "e":
        case "E":
          reset();
          onEditChange(true);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [canSlider, editing, go, onClose, onEditChange, reset, sheetOpen, toggleZoomMode, zoomed]);

  // The page behind does not scroll while the viewer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!comparison) return null;
  const { rowAspect, cellW, cellH } = comparisonShape(comparison.members);
  const isCover = comparison.fitMode === "COVER";
  const [a, b] = comparison.members;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comparison viewer"
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const s = touchStart.current;
        const t = e.changedTouches[0];
        touchStart.current = null;
        if (!s || !t || editing || zoomed || showSlider) return;
        const dx = t.clientX - s.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - s.y)) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-2">
        <span className="text-sm tabular-nums text-white/60">
          {index + 1} / {comparisons.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {comparison.title || <span className="text-white/40">Untitled comparison</span>}
          <span className="ml-2 text-xs font-normal text-white/40">{comparison.members.length} photos</span>
        </span>
        {!editing && (
          <>
            {!showSlider && (
              <button
                type="button"
                onClick={toggleZoomMode}
                title={
                  zoomMode === "synced"
                    ? "Synchronized zoom: every photo zooms to the same spot (Z)"
                    : "Whole zoom: the composition zooms as one image (Z)"
                }
                className={chromeButton}
              >
                {zoomMode === "synced" ? <Link2 size={13} /> : <Unlink2 size={13} />}
                {zoomMode === "synced" ? "Synced zoom" : "Whole zoom"}
              </button>
            )}
            {canSlider && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setViewMode((m) => (m === "row" ? "slider" : "row"));
                }}
                title="Side by side ⇄ slider (S)"
                className={chromeButton}
              >
                {viewMode === "row" ? <SlidersHorizontal size={13} /> : <Columns2 size={13} />}
                {viewMode === "row" ? "Slider" : "Side by side"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                reset();
                onEditChange(true);
              }}
              title="Compose: fill/fit, focal points, order (E)"
              className={chromeButton}
            >
              <Pencil size={13} /> Edit
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)" className={chromeButton}>
          <X size={16} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col p-4">
        {editing ? (
          <ComparisonComposeTools
            key={comparison.id}
            comparison={comparison}
            collectionId={collectionId}
            onDone={() => onEditChange(false)}
            onDeleted={onClose}
            onSheetOpenChange={setSheetOpen}
          />
        ) : showSlider && a && b ? (
          <ComparisonFitStage aspect={cellW / cellH}>
            <ImageCompareSlider
              beforeUrl={a.viewUrl ?? ""}
              afterUrl={b.viewUrl ?? ""}
              aspectW={cellW}
              aspectH={cellH}
              fit={isCover ? "cover" : "contain"}
              beforeFocal={a.focalX != null && a.focalY != null ? { x: a.focalX, y: a.focalY } : null}
              afterFocal={b.focalX != null && b.focalY != null ? { x: b.focalX, y: b.focalY } : null}
              beforeAspect={a.originalWidth / (a.originalHeight || 1)}
              afterAspect={b.originalWidth / (b.originalHeight || 1)}
              beforeLabel="Before"
              afterLabel="After"
            />
          </ComparisonFitStage>
        ) : (
          <ComparisonFitStage aspect={rowAspect}>
            <ComparisonComposite
              members={comparison.members}
              fitMode={comparison.fitMode}
              source="view"
              zoom={zoom}
              zoomMode={zoomMode}
              frameProps={frameProps}
              className="touch-none"
            />
          </ComparisonFitStage>
        )}

        {!editing && (
          <>
            {index > 0 && (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous comparison (←)"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            {index < comparisons.length - 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next comparison (→)"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </>
        )}
      </div>

      {!editing && (
        <p className="shrink-0 pb-2 text-center text-[11px] text-white/40">
          Click to zoom · drag to pan · ←/→ next · Z zoom mode{canSlider ? " · S slider" : ""} · E edit · Esc close
        </p>
      )}
    </div>,
    document.body,
  );
}
