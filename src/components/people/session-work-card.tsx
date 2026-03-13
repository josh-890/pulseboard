"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, Film, ImageIcon } from "lucide-react";
import { cn, formatPartialDate } from "@/lib/utils";
import type { PersonSessionWorkEntry, GalleryItem } from "@/lib/types";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";

const ROLE_STYLE = "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";

type SessionWorkCardProps = {
  entry: PersonSessionWorkEntry;
};

export function SessionWorkCard({ entry }: SessionWorkCardProps) {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const cover = entry.thumbnails[0];
  const filmstrip = entry.thumbnails.slice(0, 5);

  async function openLightbox(thumbIndex: number) {
    if (!galleryItems && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/sessions/${entry.sessionId}/gallery`);
        const items: GalleryItem[] = await res.json();
        setGalleryItems(items);
        // Find the matching item index in full gallery
        const thumbId = filmstrip[thumbIndex]?.id;
        const fullIndex = thumbId ? items.findIndex((i) => i.id === thumbId) : 0;
        setLightboxIndex(fullIndex >= 0 ? fullIndex : 0);
      } finally {
        setLoading(false);
      }
    } else if (galleryItems) {
      const thumbId = filmstrip[thumbIndex]?.id;
      const fullIndex = thumbId ? galleryItems.findIndex((i) => i.id === thumbId) : 0;
      setLightboxIndex(fullIndex >= 0 ? fullIndex : 0);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-white/20 bg-card/70 p-4 shadow-md backdrop-blur-sm transition-all hover:border-white/25">
        <div className="flex gap-4">
          {/* Cover thumbnail */}
          <div className="shrink-0">
            {cover ? (
              <button
                onClick={() => openLightbox(0)}
                className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/15 bg-muted/40 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-20 sm:w-20"
              >
                <Image
                  src={cover.url}
                  alt={entry.sessionName}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </button>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/15 bg-muted/40 sm:h-20 sm:w-20">
                <ImageIcon size={20} className="text-muted-foreground/40" />
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/sessions/${entry.sessionId}`}
                className="truncate text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {entry.sessionName}
              </Link>
              {entry.sessionDate && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatPartialDate(entry.sessionDate, entry.sessionDatePrecision)}
                </span>
              )}
            </div>

            {/* Roles + media count */}
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.roles.map((role) => (
                <span
                  key={role}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    ROLE_STYLE,
                  )}
                >
                  {role}
                </span>
              ))}
              {entry.mediaCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                  <ImageIcon size={10} />
                  {entry.mediaCount}
                </span>
              )}
            </div>

            {/* Label */}
            {entry.labelName && (
              <p className="text-xs text-muted-foreground">{entry.labelName}</p>
            )}
          </div>
        </div>

        {/* Filmstrip */}
        {filmstrip.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-none">
            {filmstrip.map((thumb, i) => (
              <button
                key={thumb.id}
                onClick={() => openLightbox(i)}
                disabled={loading}
                className="relative h-12 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-muted/40 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                style={{ width: Math.round((thumb.width / thumb.height) * 48) || 48 }}
              >
                <Image
                  src={thumb.url}
                  alt=""
                  width={Math.round((thumb.width / thumb.height) * 48) || 48}
                  height={48}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              </button>
            ))}
          </div>
        )}

        {/* Linked sets */}
        {entry.linkedSets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entry.linkedSets.map((set) => (
              <Link
                key={set.setId}
                href={`/sets/${set.setId}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-card/50 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {set.type === "photo" ? <Camera size={10} /> : <Film size={10} />}
                <span className="max-w-[150px] truncate">{set.title}</span>
                {set.releaseDate && (
                  <span className="text-muted-foreground/60">
                    {formatPartialDate(set.releaseDate, set.releaseDatePrecision)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && galleryItems && (
        <GalleryLightbox
          items={galleryItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
