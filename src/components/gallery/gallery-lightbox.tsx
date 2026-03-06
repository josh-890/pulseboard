"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  PanelRight,
  PanelRightClose,
  Rows3,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import { GalleryFilmstrip } from "./gallery-filmstrip";
import { GalleryInfoPanel } from "./gallery-info-panel";
import type { ReferenceContext, CollectionContext } from "./gallery-info-panel";

export type { ReferenceContext, CategoryWithGroup, CollectionContext } from "./gallery-info-panel";

type GalleryLightboxProps = {
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
  onFavoriteToggle?: (itemId: string) => void;
  onSetCover?: (mediaItemId: string | null) => void;
  coverMediaItemId?: string | null;
  onTagsChanged?: (itemId: string, newTags: string[]) => void;
  onUpdateTags?: (
    itemId: string,
    tags: string[],
  ) => Promise<{ success: boolean }>;
  // Person headshot context
  onAssignHeadshot?: (mediaItemId: string, slot: number) => void;
  onRemoveHeadshot?: (mediaItemId: string) => void;
  profileLabels?: ProfileImageLabel[];
  headshotSlotMap?: Map<string, number>;
  // Find similar
  onFindSimilar?: (mediaItemId: string) => void;
  // Focal point
  sessionId?: string;
  // Reference context (optional — forwarded to GalleryInfoPanel)
  referenceContext?: ReferenceContext;
  // Standalone collection context (optional — forwarded to GalleryInfoPanel)
  collectionContext?: CollectionContext;
};

export function GalleryLightbox(props: GalleryLightboxProps) {
  return <SimpleLightbox {...props} />;
}

// ─── Simple mode (all contexts) ──────────────────────────────────────────────

function SimpleLightbox({
  items,
  initialIndex,
  onClose,
  onFavoriteToggle,
  onSetCover,
  coverMediaItemId,
  onTagsChanged,
  onUpdateTags,
  onAssignHeadshot,
  onRemoveHeadshot,
  profileLabels,
  headshotSlotMap,
  onFindSimilar,
  sessionId,
  referenceContext,
  collectionContext,
}: GalleryLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showInfoPanel, setShowInfoPanel] = useState(referenceContext ? true : false);
  const [showFilmstrip, setShowFilmstrip] = useState(false);
  const [focalOverlay, setFocalOverlay] = useState(false);
  const [localFocalPoints, setLocalFocalPoints] = useState<
    Map<string, { focalX: number | null; focalY: number | null }>
  >(new Map());
  // Local link overrides for optimistic updates from reference context
  const [localLinksMap, setLocalLinksMap] = useState<
    Map<string, GalleryItem["links"]>
  >(new Map());
  const [localCollectionIdsMap, setLocalCollectionIdsMap] = useState<
    Map<string, string[]>
  >(new Map());
  const touchStartX = useRef<number | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [imageRect, setImageRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const localItems = useMemo(
    () =>
      items.map((it) => {
        const focalOverride = localFocalPoints.get(it.id);
        const linksOverride = localLinksMap.get(it.id);
        const collOverride = localCollectionIdsMap.get(it.id);
        let result = it;
        if (focalOverride) result = { ...result, focalX: focalOverride.focalX, focalY: focalOverride.focalY };
        if (linksOverride !== undefined) result = { ...result, links: linksOverride };
        if (collOverride !== undefined) result = { ...result, collectionIds: collOverride };
        return result;
      }),
    [items, localFocalPoints, localLinksMap, localCollectionIdsMap],
  );

  const item = localItems[currentIndex];

  const handleFocalPointChange = useCallback(
    (itemId: string, focalX: number | null, focalY: number | null) => {
      setLocalFocalPoints((prev) => {
        const next = new Map(prev);
        next.set(itemId, { focalX, focalY });
        return next;
      });
    },
    [],
  );

  // Build referenceContext with local-state-aware callbacks
  const augmentedReferenceContext = useMemo(() => {
    if (!referenceContext) return undefined;
    return {
      ...referenceContext,
      onLinksChange: (itemId: string, links: NonNullable<GalleryItem["links"]>) => {
        setLocalLinksMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, links);
          return next;
        });
        referenceContext.onLinksChange?.(itemId, links);
      },
      onCollectionIdsChange: (itemId: string, collIds: string[]) => {
        setLocalCollectionIdsMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, collIds);
          return next;
        });
        referenceContext.onCollectionIdsChange?.(itemId, collIds);
      },
    };
  }, [referenceContext]);

  // Build standalone collectionContext with local-state-aware callback
  const augmentedCollectionContext = useMemo(() => {
    if (!collectionContext) return undefined;
    return {
      ...collectionContext,
      onCollectionIdsChange: (itemId: string, collIds: string[]) => {
        setLocalCollectionIdsMap((prev) => {
          const next = new Map(prev);
          next.set(itemId, collIds);
          return next;
        });
        collectionContext.onCollectionIdsChange?.(itemId, collIds);
      },
    };
  }, [collectionContext]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNavigate = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const hasFocalPointSupport = !!(sessionId || referenceContext?.sessionId);

  const handleToggleInfoPanel = useCallback(() => {
    setShowInfoPanel((prev) => {
      if (prev) {
        // Closing the panel — reset focal overlay
        setFocalOverlay(false);
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "i":
        case "I":
          handleToggleInfoPanel();
          break;
        case "t":
        case "T":
          setShowFilmstrip((p) => !p);
          break;
        case "f":
        case "F":
          if (hasFocalPointSupport) setFocalOverlay((p) => !p);
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev, handleToggleInfoPanel, hasFocalPointSupport]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Compute the rendered image rect for focal point overlay
  const computeRect = useCallback(() => {
    const container = imageContainerRef.current;
    if (!container || !item) return;
    const img = container.querySelector("img");
    if (!img || !img.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    setImageRect({ x, y, w, h });
  }, [item]);

  useEffect(() => {
    if (!focalOverlay) return;
    const container = imageContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => computeRect());
    observer.observe(container);
    return () => observer.disconnect();
  }, [focalOverlay, computeRect, currentIndex]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  }

  if (!item) return null;

  const displayUrl =
    item.urls.gallery_1600 ?? item.urls.gallery_1024 ?? item.urls.original;

  const infoPanelProps = {
    item,
    onSetCover,
    coverMediaItemId,
    onAssignHeadshot,
    onRemoveHeadshot,
    profileLabels,
    headshotSlotMap,
    onFavoriteToggle,
    onUpdateTags,
    onTagsChanged,
    onFindSimilar,
    sessionId,
    onFocalPointChange: handleFocalPointChange,
    onFocalOverlayToggle: () => setFocalOverlay((p) => !p),
    focalOverlayActive: focalOverlay,
    referenceContext: augmentedReferenceContext,
    collectionContext: augmentedCollectionContext,
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 outline-none"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-white/5">
        <span className="text-sm text-white/70">
          {currentIndex + 1} / {localItems.length}
        </span>
        <span className="hidden sm:block truncate max-w-[40%] text-xs text-white/50">
          {item.filename}
        </span>
        <div className="flex items-center gap-1.5">
          {hasFocalPointSupport && (
            <button
              type="button"
              onClick={() => setFocalOverlay((p) => !p)}
              className={cn(
                "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                focalOverlay
                  ? "bg-amber-500/30 text-amber-400 ring-1 ring-amber-500/40"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
              aria-label={focalOverlay ? "Hide focal point overlay" : "Show focal point overlay"}
              aria-pressed={focalOverlay}
              title="Focal point overlay (F)"
            >
              <Crosshair size={16} />
            </button>
          )}
          {localItems.length > 1 && (
            <button
              type="button"
              onClick={() => setShowFilmstrip((p) => !p)}
              className={cn(
                "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                showFilmstrip
                  ? "bg-white/20 text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
              )}
              aria-label={showFilmstrip ? "Hide filmstrip" : "Show filmstrip"}
              title="Filmstrip (T)"
            >
              <Rows3 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleInfoPanel}
            className={cn(
              "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              showInfoPanel
                ? "bg-white/20 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
            )}
            aria-label={showInfoPanel ? "Hide info panel" : "Show info panel"}
            title="Info panel (I)"
          >
            {showInfoPanel ? (
              <PanelRightClose size={16} />
            ) : (
              <PanelRight size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-w-0">
          {/* Image area with nav */}
          <div ref={imageContainerRef} className="relative flex flex-1 items-center justify-center p-4 sm:p-6 min-h-0">
            {localItems.length > 1 && (
              <>
                {currentIndex > 0 && (
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous photo"
                    className="absolute left-2 sm:left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
                {currentIndex < localItems.length - 1 && (
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next photo"
                    className="absolute right-2 sm:right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <ChevronRight size={24} />
                  </button>
                )}
              </>
            )}

            <Image
              src={displayUrl}
              alt={item.caption ?? `Photo ${currentIndex + 1}`}
              width={item.originalWidth}
              height={item.originalHeight}
              unoptimized
              className="max-h-full max-w-full object-contain rounded-lg"
              priority
              onLoad={computeRect}
            />

            {/* Focal point overlay on main image */}
            {focalOverlay && imageRect && item.focalX != null && item.focalY != null && (
              <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
                {/* Crosshair lines */}
                <div
                  className="absolute h-px bg-amber-500/30"
                  style={{
                    left: imageRect.x,
                    width: imageRect.w,
                    top: imageRect.y + item.focalY * imageRect.h,
                  }}
                />
                <div
                  className="absolute w-px bg-amber-500/30"
                  style={{
                    top: imageRect.y,
                    height: imageRect.h,
                    left: imageRect.x + item.focalX * imageRect.w,
                  }}
                />
                {/* Ring + center dot */}
                <div
                  className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-500 shadow-[0_0_8px_rgba(0,0,0,0.6)] transition-all duration-200"
                  style={{
                    left: imageRect.x + item.focalX * imageRect.w,
                    top: imageRect.y + item.focalY * imageRect.h,
                  }}
                >
                  <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" />
                </div>
              </div>
            )}
          </div>

          {/* Filmstrip */}
          {showFilmstrip && localItems.length > 1 && (
            <GalleryFilmstrip
              items={localItems}
              activeIndex={currentIndex}
              onNavigate={handleNavigate}
            />
          )}
        </div>

        {/* Right: info panel (desktop) */}
        {showInfoPanel && (
          <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-white/10 bg-black/60 backdrop-blur-md overflow-y-auto">
            <GalleryInfoPanel {...infoPanelProps} />
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet info panel */}
      {showInfoPanel && (
        <div className="lg:hidden border-t border-white/10 bg-black/80 backdrop-blur-sm max-h-[35vh] overflow-y-auto">
          <GalleryInfoPanel {...infoPanelProps} />
        </div>
      )}
    </div>,
    document.body,
  );
}
