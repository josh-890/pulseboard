"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, PanelRight, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import { MediaMetadataPanel } from "./media-metadata-panel";
import { MediaFilmstrip } from "./media-filmstrip";

type EntityOption = { id: string; name: string };

type MediaLightboxProps = {
  items: MediaItemWithLinks[];
  currentIndex: number;
  personId: string;
  sessionId: string;
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  onClose: () => void;
  onNavigate: (index: number) => void;
  onItemsChange?: (updatedItems: MediaItemWithLinks[]) => void;
};

export function MediaLightbox({
  items,
  currentIndex,
  personId,
  sessionId,
  slotLabels,
  collections,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  onClose,
  onNavigate,
  onItemsChange,
}: MediaLightboxProps) {
  const [showPanel, setShowPanel] = useState(true);
  const current = items[currentIndex];

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

      {/* Main content: image area + optional side panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left: image + filmstrip */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Image area with nav buttons */}
          <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6 min-h-0">
            {/* Navigation buttons */}
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

            {/* Image */}
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

          {/* Filmstrip */}
          {items.length > 1 && (
            <MediaFilmstrip
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
              allItems={items}
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
