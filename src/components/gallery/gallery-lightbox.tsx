"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Frame,
  Heart,
  PanelRight,
  PanelRightClose,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/types";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import { GalleryTagPanel } from "./gallery-tag-panel";
import { GalleryFilmstrip } from "./gallery-filmstrip";
import { MediaMetadataPanel } from "@/components/media/media-metadata-panel";

type EntityOption = { id: string; name: string };

type SimpleProps = {
  mode: "simple";
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
  onFavoriteToggle?: (itemId: string) => void;
  onSetCover?: (mediaItemId: string | null) => void;
  coverMediaItemId?: string | null;
  onTagsChanged?: (itemId: string, newTags: string[]) => void;
  onUpdateTags?: (itemId: string, tags: string[]) => Promise<{ success: boolean }>;
};

type ManagerProps = {
  mode: "manager";
  items: GalleryItem[];
  managerItems: MediaItemWithLinks[];
  initialIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  personId: string;
  sessionId: string;
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  onItemsChange?: (updatedItems: MediaItemWithLinks[]) => void;
};

type GalleryLightboxProps = SimpleProps | ManagerProps;

export function GalleryLightbox(props: GalleryLightboxProps) {
  if (props.mode === "simple") {
    return <SimpleLightbox {...props} />;
  }
  return <ManagerLightbox {...props} />;
}

// ─── Simple mode (person/set detail pages) ───────────────────────────────────

function SimpleLightbox({
  items,
  initialIndex,
  onClose,
  onFavoriteToggle,
  onSetCover,
  coverMediaItemId,
  onTagsChanged,
  onUpdateTags,
}: SimpleProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const item = items[currentIndex];

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(items.length - 1, i + 1));
    setTagPanelOpen(false);
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
    setTagPanelOpen(false);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "Escape":
          if (tagPanelOpen) {
            setTagPanelOpen(false);
          } else {
            onClose();
          }
          break;
        case "ArrowLeft":
          goPrev();
          break;
        case "ArrowRight":
          goNext();
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev, tagPanelOpen]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

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

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) {
      if (tagPanelOpen) {
        setTagPanelOpen(false);
      } else {
        onClose();
      }
    }
  }

  if (!item) return null;

  const displayUrl = item.urls.gallery_1024 ?? item.urls.original;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      tabIndex={-1}
      onClick={handleOverlayClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 outline-none"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close lightbox"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
      >
        <X size={24} />
      </button>

      {currentIndex > 0 && (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous photo"
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {currentIndex < items.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          aria-label="Next photo"
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <ChevronRight size={28} />
        </button>
      )}

      <div
        className={cn(
          "relative max-w-[90vw] transition-all duration-200",
          tagPanelOpen ? "max-h-[60vh]" : "max-h-[85vh]",
        )}
      >
        <Image
          src={displayUrl}
          alt={item.caption ?? `Photo ${currentIndex + 1}`}
          width={item.originalWidth}
          height={item.originalHeight}
          className={cn(
            "w-auto object-contain transition-all duration-200",
            tagPanelOpen ? "max-h-[60vh]" : "max-h-[85vh]",
          )}
          unoptimized
          priority
        />
      </div>

      {/* Bottom section: action bar + tag panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-stretch">
        <div className="flex flex-col items-center gap-2 pb-4 pt-2">
          {item.caption && (
            <p className="max-w-lg text-center text-sm text-white/80">
              {item.caption}
            </p>
          )}
          <div className="flex items-center gap-4">
            {items.length > 1 && (
              <span className="text-sm text-white/70">
                {currentIndex + 1} / {items.length}
              </span>
            )}
            {onFavoriteToggle && (
              <button
                type="button"
                onClick={() => onFavoriteToggle(item.id)}
                aria-label={
                  item.isFavorite ? "Remove from favorites" : "Set as favorite"
                }
                className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              >
                <Heart
                  size={18}
                  className={cn(
                    item.isFavorite && "fill-red-500 text-red-500",
                  )}
                />
              </button>
            )}
            {onSetCover && (
              <button
                type="button"
                onClick={() =>
                  onSetCover(
                    coverMediaItemId === item.id ? null : item.id,
                  )
                }
                aria-label={
                  coverMediaItemId === item.id
                    ? "Remove as cover"
                    : "Set as cover"
                }
                className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              >
                <Frame
                  size={18}
                  className={cn(
                    coverMediaItemId === item.id &&
                      "fill-amber-500 text-amber-500",
                  )}
                />
              </button>
            )}
            {onTagsChanged && onUpdateTags && (
              <button
                type="button"
                onClick={() => setTagPanelOpen((prev) => !prev)}
                aria-label={tagPanelOpen ? "Close tag panel" : "Open tag panel"}
                className={cn(
                  "rounded-full p-2 text-white transition-colors",
                  tagPanelOpen
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/10 hover:bg-white/20",
                )}
              >
                <Tag size={18} />
              </button>
            )}
          </div>
        </div>

        {tagPanelOpen && onTagsChanged && onUpdateTags && (
          <GalleryTagPanel
            item={item}
            onTagsChanged={onTagsChanged}
            onClose={() => setTagPanelOpen(false)}
            onUpdateTags={onUpdateTags}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Manager mode (reference session pages) ──────────────────────────────────

function ManagerLightbox({
  items,
  managerItems,
  initialIndex,
  onClose,
  onNavigate,
  personId,
  sessionId,
  slotLabels,
  collections,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  onItemsChange,
}: ManagerProps) {
  const [showPanel, setShowPanel] = useState(true);
  const currentIndex = initialIndex;
  const current = managerItems[currentIndex];

  const goNext = useCallback(() => {
    onNavigate((currentIndex + 1) % items.length);
  }, [currentIndex, items.length, onNavigate]);

  const goPrev = useCallback(() => {
    onNavigate((currentIndex - 1 + items.length) % items.length);
  }, [currentIndex, items.length, onNavigate]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "i" || e.key === "I") setShowPanel((p) => !p);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  if (!current) return null;

  const imageUrl =
    current.urls.gallery_1600 ||
    current.urls.gallery_1024 ||
    current.urls.original ||
    "";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-white/5">
        <span className="text-sm text-white/70">
          {currentIndex + 1} / {items.length}
        </span>
        <span className="hidden sm:block truncate max-w-[40%] text-xs text-white/50">
          {current.filename}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPanel((p) => !p)}
            className={cn(
              "rounded-full p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              showPanel
                ? "bg-white/20 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white",
            )}
            aria-label={showPanel ? "Hide info panel" : "Show info panel"}
          >
            {showPanel ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
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
          <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6 min-h-0">
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-2 sm:left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-2 sm:right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  aria-label="Next image"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            <Image
              src={imageUrl}
              alt={current.caption ?? current.filename}
              width={current.originalWidth}
              height={current.originalHeight}
              unoptimized
              className="max-h-full max-w-full object-contain rounded-lg"
              priority
            />
          </div>

          {items.length > 1 && (
            <GalleryFilmstrip
              items={items}
              activeIndex={currentIndex}
              onNavigate={onNavigate}
            />
          )}
        </div>

        {/* Right: inspector panel (desktop) */}
        {showPanel && (
          <div className="hidden lg:flex w-[320px] shrink-0 flex-col border-l border-white/10 bg-black/60 backdrop-blur-md overflow-y-auto">
            <MediaMetadataPanel
              items={[current]}
              allItems={managerItems}
              personId={personId}
              sessionId={sessionId}
              slotLabels={slotLabels}
              collections={collections}
              bodyMarks={bodyMarks}
              bodyModifications={bodyModifications}
              cosmeticProcedures={cosmeticProcedures}
              onItemsChange={onItemsChange}
              variant="lightbox"
            />
          </div>
        )}
      </div>

      {/* Mobile: bottom sheet panel */}
      {showPanel && (
        <div className="lg:hidden border-t border-white/10 bg-black/80 backdrop-blur-sm max-h-[35vh] overflow-y-auto">
          <MediaMetadataPanel
            items={[current]}
            personId={personId}
            sessionId={sessionId}
            slotLabels={slotLabels}
            collections={collections}
            bodyMarks={bodyMarks}
            bodyModifications={bodyModifications}
            cosmeticProcedures={cosmeticProcedures}
            onItemsChange={onItemsChange}
            variant="lightbox"
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
