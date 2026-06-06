"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ImageRect = { x: number; y: number; w: number; h: number; cw: number; ch: number };

export type ZoomableImageProps = {
  /** Image shown at fit (object-contain). */
  fitUrl: string;
  /** Higher-resolution source swapped in once the user zooms (e.g. master_4000). */
  zoomUrl?: string | null;
  /** Natural dimensions for next/image (falls back to a square box if unknown). */
  width?: number | null;
  height?: number | null;
  alt: string;
  /** Optional focal-point crosshair overlay (only drawn at fit). */
  focalX?: number | null;
  focalY?: number | null;
  showFocalOverlay?: boolean;
  className?: string;
  /** Notifies the parent when the zoom state flips (so it can suppress swipe-nav). */
  onZoomChange?: (zoomed: boolean) => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Self-contained pan/zoom image viewer. Double-click (or pinch) to zoom toward the
 * cursor up to a fill scale, drag to pan; double-click again (or pinch out) to reset.
 * Extracted from gallery-lightbox so the lightbox and the media pickers share one
 * implementation.
 */
export function ZoomableImage({
  fitUrl,
  zoomUrl,
  width,
  height,
  alt,
  focalX,
  focalY,
  showFocalOverlay = false,
  className,
  onZoomChange,
}: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomState, setZoomState] = useState<"fit" | "zoomed">("fit");
  const [zoomTx, setZoomTx] = useState(0);
  const [zoomTy, setZoomTy] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [imageRect, setImageRect] = useState<ImageRect | null>(null);
  const [prevFit, setPrevFit] = useState(fitUrl);

  const panStartRef = useRef({ mouseX: 0, mouseY: 0, baseTx: 0, baseTy: 0 });
  const touchPanRef = useRef({ startX: 0, startY: 0, baseTx: 0, baseTy: 0 });
  const pinchRef = useRef({ startDist: 0, startScale: 1, startTx: 0, startTy: 0, startMidX: 0, startMidY: 0, containerLeft: 0, containerTop: 0, cw: 0, ch: 0 });
  const isPinchingRef = useRef(false);

  // Reset zoom whenever the displayed image changes — done during render (React's
  // "adjust state when a prop changes" pattern), not in an effect.
  if (prevFit !== fitUrl) {
    setPrevFit(fitUrl);
    setZoomState("fit");
    setZoomTx(0);
    setZoomTy(0);
    setZoomScale(1);
    setZoomedSrc(null);
    setIsPanning(false);
    setIsPinching(false);
  }

  useEffect(() => {
    onZoomChange?.(zoomState === "zoomed");
  }, [zoomState, onZoomChange]);

  const computeRect = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const img = container.querySelector("img");
    if (!img || !img.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    setImageRect({ x: (cw - w) / 2, y: (ch - h) / 2, w, h, cw, ch });
  }, []);

  const fillScale = useMemo(() => {
    if (!imageRect) return 2;
    return Math.max(imageRect.cw / imageRect.w, imageRect.ch / imageRect.h);
  }, [imageRect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => computeRect());
    observer.observe(container);
    return () => observer.disconnect();
  }, [computeRect]);

  // ── Mouse pan ──
  function handleMouseDown(e: React.MouseEvent) {
    if (zoomState !== "zoomed") return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, baseTx: zoomTx, baseTy: zoomTy };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!isPanning) return;
    const { mouseX, mouseY, baseTx, baseTy } = panStartRef.current;
    setZoomTx(baseTx + (e.clientX - mouseX));
    setZoomTy(baseTy + (e.clientY - mouseY));
  }
  function handleMouseUp() {
    setIsPanning(false);
  }

  // ── Double-click zoom toward cursor ──
  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!imageRect || !containerRef.current) return;
    if (zoomState === "zoomed") {
      setZoomState("fit");
      setZoomTx(0);
      setZoomTy(0);
      setZoomScale(1);
      setZoomedSrc(null);
      return;
    }
    const containerEl = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - containerEl.left;
    const clickY = e.clientY - containerEl.top;
    const relX = clickX - (imageRect.x + imageRect.w / 2);
    const relY = clickY - (imageRect.y + imageRect.h / 2);
    const S = fillScale;
    setZoomTx(relX * (1 - S));
    setZoomTy(relY * (1 - S));
    setZoomScale(S);
    setZoomState("zoomed");
    if (zoomUrl && zoomUrl !== fitUrl) {
      const preload = new window.Image();
      preload.onload = () => setZoomedSrc(zoomUrl);
      preload.src = zoomUrl;
    }
  }

  // ── Touch pinch + pan ──
  function getTouchDistance(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.stopPropagation();
      isPinchingRef.current = true;
      setIsPinching(true);
      const dist = getTouchDistance(e.touches);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const el = containerRef.current!.getBoundingClientRect();
      pinchRef.current = {
        startDist: dist, startScale: zoomScale, startTx: zoomTx, startTy: zoomTy,
        startMidX: midX, startMidY: midY, containerLeft: el.left, containerTop: el.top, cw: el.width, ch: el.height,
      };
      if (zoomState === "fit") setZoomState("zoomed");
      if (zoomUrl && zoomUrl !== fitUrl && !zoomedSrc) {
        const preload = new window.Image();
        preload.onload = () => setZoomedSrc(zoomUrl);
        preload.src = zoomUrl;
      }
    } else if (e.touches.length === 1 && zoomState === "zoomed") {
      touchPanRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, baseTx: zoomTx, baseTy: zoomTy };
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && isPinchingRef.current) {
      e.stopPropagation();
      const { startDist, startScale, startTx, startTy, startMidX, startMidY, containerLeft, containerTop, cw, ch } = pinchRef.current;
      const currentDist = getTouchDistance(e.touches);
      const newScale = Math.max(1, Math.min(startScale * (currentDist / startDist), 10));
      const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const originX = startMidX - containerLeft - cw / 2;
      const originY = startMidY - containerTop - ch / 2;
      setZoomTx(startTx + originX * (startScale - newScale) + (currentMidX - startMidX));
      setZoomTy(startTy + originY * (startScale - newScale) + (currentMidY - startMidY));
      setZoomScale(newScale);
      if (newScale <= 1) {
        setZoomState("fit");
        setZoomTx(0);
        setZoomTy(0);
      } else if (zoomState !== "zoomed") {
        setZoomState("zoomed");
      }
    } else if (e.touches.length === 1 && zoomState === "zoomed" && !isPinchingRef.current) {
      const { startX, startY, baseTx, baseTy } = touchPanRef.current;
      setZoomTx(baseTx + (e.touches[0].clientX - startX));
      setZoomTy(baseTy + (e.touches[0].clientY - startY));
    }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2 && isPinchingRef.current) {
      isPinchingRef.current = false;
      setIsPinching(false);
      if (zoomScale <= 1.05) {
        setZoomState("fit");
        setZoomTx(0);
        setZoomTy(0);
        setZoomScale(1);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", className)}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: zoomState === "zoomed" ? `translate(${zoomTx}px, ${zoomTy}px) scale(${zoomScale})` : "translate(0px, 0px) scale(1)",
          transformOrigin: "50% 50%",
          transition: isPanning || isPinching ? "none" : "transform 0.2s ease",
          cursor: zoomState === "zoomed" ? (isPanning ? "grabbing" : "grab") : "zoom-in",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <Image
          src={zoomedSrc ?? fitUrl}
          alt={alt}
          width={width || 1200}
          height={height || 1200}
          unoptimized
          className="max-h-full max-w-full object-contain"
          priority
          onLoad={computeRect}
        />
      </div>

      {showFocalOverlay && zoomState === "fit" && imageRect && focalX != null && focalY != null && (
        <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
          <div className="absolute h-px bg-amber-500/30" style={{ left: imageRect.x, width: imageRect.w, top: imageRect.y + focalY * imageRect.h }} />
          <div className="absolute w-px bg-amber-500/30" style={{ top: imageRect.y, height: imageRect.h, left: imageRect.x + focalX * imageRect.w }} />
          <div
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
            style={{ left: imageRect.x + focalX * imageRect.w, top: imageRect.y + focalY * imageRect.h }}
          >
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" />
          </div>
        </div>
      )}
    </div>
  );
}
