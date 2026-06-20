"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, ImageIcon } from "lucide-react";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { AtlasTile } from "@/lib/services/atlas-service";

type AtlasGridProps = {
  tiles: AtlasTile[];
  aspectW: number;
  aspectH: number;
};

export function AtlasGrid({ tiles, aspectW, aspectH }: AtlasGridProps) {
  const [query, setQuery] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tiles;
    return tiles.filter((t) => t.personName.toLowerCase().includes(q));
  }, [tiles, query]);

  const lightboxItems = useMemo(() => filtered.map((t) => t.item), [filtered]);

  if (tiles.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 bg-card/70 p-12 text-center shadow-md backdrop-blur-sm">
        <ImageIcon size={32} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No aligned images in this category yet. Align photos on a person&rsquo;s Details tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by person…"
          className="w-full rounded-lg border border-white/15 bg-background/60 py-1.5 pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No people match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((t, i) => (
            <div key={t.mediaItemId} className="group flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label={`View ${t.personName}`}
                className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-white/10 bg-muted/30 transition-colors group-hover:border-amber-500/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
              >
                {t.thumbUrl ? (
                  <Image src={t.thumbUrl} alt={t.personName} fill unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon size={20} className="text-muted-foreground/40" />
                  </div>
                )}
              </button>
              <Link
                href={`/people/${t.personId}`}
                className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                title={`Go to ${t.personName}`}
              >
                {t.personName}
              </Link>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && lightboxItems[lightboxIndex] && (
        <GalleryLightbox
          items={lightboxItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
