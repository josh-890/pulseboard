"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight, ImageIcon } from "lucide-react";
import { formatPartialDate } from "@/lib/utils";
import type { PersonProductionSession, GalleryItem } from "@/lib/types";
import { JustifiedGrid } from "@/components/gallery/justified-grid";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { Skeleton } from "@/components/ui/skeleton";

type ProductionSessionSectionProps = {
  session: PersonProductionSession;
  isExpanded: boolean;
  onToggle: () => void;
};

export function ProductionSessionSection({
  session,
  isExpanded,
  onToggle,
}: ProductionSessionSectionProps) {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleToggle = useCallback(async () => {
    onToggle();
    // Lazy-load gallery on first expand
    if (!isExpanded && !galleryItems && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/sessions/${session.sessionId}/gallery`);
        const items: GalleryItem[] = await res.json();
        setGalleryItems(items);
      } finally {
        setLoading(false);
      }
    }
  }, [isExpanded, galleryItems, loading, session.sessionId, onToggle]);

  const indexMap = new Map<string, number>();
  galleryItems?.forEach((item, i) => indexMap.set(item.id, i));

  return (
    <div className="rounded-xl border border-white/15 bg-card/50 overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {isExpanded ? (
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{session.sessionName}</span>
            {session.sessionDate && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatPartialDate(session.sessionDate, session.sessionDatePrecision)}
              </span>
            )}
            {session.roles.length > 0 && (
              <span className="text-xs text-muted-foreground/70">
                {session.roles.join(", ")}
              </span>
            )}
          </div>
          {session.labelName && (
            <p className="mt-0.5 text-xs text-muted-foreground/60">{session.labelName}</p>
          )}
        </div>

        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
          <ImageIcon size={10} />
          {session.mediaCount}
        </span>

        {/* Preview thumbnails (collapsed only) */}
        {!isExpanded && session.previewThumbnails.length > 0 && (
          <div className="hidden shrink-0 gap-1 sm:flex">
            {session.previewThumbnails.map((thumb) => (
              <div
                key={thumb.id}
                className="h-9 overflow-hidden rounded-md border border-white/10 bg-muted/40"
                style={{ width: Math.round((thumb.width / thumb.height) * 36) || 36 }}
              >
                <Image
                  src={thumb.url}
                  alt=""
                  width={Math.round((thumb.width / thumb.height) * 36) || 36}
                  height={36}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/10 p-4">
          {loading && !galleryItems && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          )}
          {galleryItems && galleryItems.length > 0 && (
            <JustifiedGrid
              items={galleryItems}
              onOpen={(id) => {
                const idx = indexMap.get(id);
                if (idx !== undefined) setLightboxIndex(idx);
              }}
            />
          )}
          {galleryItems && galleryItems.length === 0 && (
            <p className="text-sm text-muted-foreground/60">No media items in this session.</p>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && galleryItems && (
        <GalleryLightbox
          items={galleryItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
