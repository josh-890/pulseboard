"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight, PanelBottomOpen, PanelBottomClose } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import { MediaMetadataPanel } from "./media-metadata-panel";

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

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm text-white/70">
          {currentIndex + 1} / {items.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPanel((p) => !p)}
            className="rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label={showPanel ? "Hide metadata panel" : "Show metadata panel"}
          >
            {showPanel ? (
              <PanelBottomClose size={16} />
            ) : (
              <PanelBottomOpen size={16} />
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

      {/* Main area */}
      <div className="relative flex flex-1 min-h-0">
        {/* Navigation buttons */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {/* Image */}
        <div className="flex flex-1 items-center justify-center p-8">
          <Image
            src={imageUrl}
            alt={current.caption ?? current.filename}
            width={current.originalWidth}
            height={current.originalHeight}
            unoptimized
            className={cn(
              "max-w-full rounded-lg object-contain",
              showPanel ? "max-h-[55vh]" : "max-h-[80vh]",
            )}
            priority
          />
        </div>
      </div>

      {/* Bottom metadata panel */}
      {showPanel && (
        <div className="border-t border-white/10 bg-black/80 backdrop-blur-sm">
          <div className="mx-auto max-w-4xl max-h-[30vh] overflow-y-auto">
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
            />
          </div>
        </div>
      )}
    </div>
  );
}
