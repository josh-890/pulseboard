"use client";

import { useRef, useState } from "react";
import NextImage from "next/image";
import { Images, Play, Sparkles } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import type { PersonShowcase as PersonShowcaseData, ShowcaseItem } from "@/lib/services/person-showcase-service";
import { ShowcaseSourceChip } from "./showcase-source-chip";
import { ShowcaseSlideshow } from "./showcase-slideshow";

// The top of a person's Overview (2026-10-16): their best photos as a mosaic — one
// large tile and the next ones beside it — the way you marked them (iconic, ★,
// outtake), filled with their production photos at random. Iconic stays in front;
// the rest rotates daily. A tile opens the lightbox over the whole pool, ▶ a
// full-screen slideshow.
//
// Tiles per width: phone 1 + 3 (3 columns), tablet 1 + 4 (4), desktop 1 + 6 (5).
// The last visible tile carries "+N" when the pool is larger.

const VISIBLE = { base: 4, md: 5, lg: 7 } as const;

// Which tiles show at which width
function tileVisibility(i: number) {
  if (i < VISIBLE.base) return "";
  if (i < VISIBLE.md) return "hidden md:block";
  return "hidden lg:block";
}

// The "+N" overlay sits on the last tile visible at each width
function moreOverlay(i: number, total: number): { n: number; className: string } | null {
  if (i === VISIBLE.base - 1 && total > VISIBLE.base) return { n: total - VISIBLE.base, className: "flex md:hidden" };
  if (i === VISIBLE.md - 1 && total > VISIBLE.md) return { n: total - VISIBLE.md, className: "hidden md:flex lg:hidden" };
  if (i === VISIBLE.lg - 1 && total > VISIBLE.lg) return { n: total - VISIBLE.lg, className: "hidden lg:flex" };
  return null;
}

const tileUrl = (item: ShowcaseItem, big: boolean) =>
  (big ? item.urls.view_1200 : item.urls.gallery_512) ?? item.urls.view_1200 ?? item.urls.original;

export type PersonShowcaseProps = {
  showcase: PersonShowcaseData;
  personName: string;
  /** Seeds the lightbox's "assign to detail" picker */
  person: { id: string; name: string };
};

export function PersonShowcase({ showcase, personName, person }: PersonShowcaseProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const playRef = useRef<HTMLButtonElement>(null);
  const { items, curatedCount } = showcase;
  if (items.length === 0) return null;

  const tiles = items.slice(0, VISIBLE.lg);

  return (
    <section aria-labelledby="showcase-title" className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="showcase-title" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles size={18} className="text-amber-400" aria-hidden="true" />
            Showcase
          </h2>
          <p className="text-xs text-muted-foreground">
            {curatedCount > 0
              ? `${curatedCount} you marked${curatedCount < items.length ? ", the rest picked at random" : ""} · changes daily`
              : "Picked at random from their sets — mark photos iconic, ★ or outtake to lead here · changes daily"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLightboxIndex(0)}>
            <Images size={14} className="mr-1.5" aria-hidden="true" />
            All {items.length}
          </Button>
          <Button ref={playRef} type="button" size="sm" onClick={() => setSlideshow(true)}>
            <Play size={14} className="mr-1.5" aria-hidden="true" />
            Slideshow
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5">
        {tiles.map((item, i) => {
          const big = i === 0;
          const more = moreOverlay(i, items.length);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Open photo ${i + 1} of ${items.length}`}
              className={cn(
                "group relative overflow-hidden rounded-xl bg-muted/40 shadow-md ring-1 ring-white/10",
                "transition-[transform,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-xl",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                big ? "col-span-3 aspect-[4/5] md:col-span-2 md:row-span-2 md:aspect-auto" : "aspect-[4/5]",
                tileVisibility(i),
              )}
            >
              <NextImage
                src={tileUrl(item, big)}
                alt=""
                fill
                unoptimized
                sizes={big ? "(min-width: 768px) 40vw, 100vw" : "20vw"}
                className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
                style={focalStyle(item.focalX, item.focalY)}
                priority={big}
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <ShowcaseSourceChip source={item.source} className="absolute bottom-2 left-2" />
              {more && (
                <span
                  className={cn(
                    "absolute inset-0 items-center justify-center bg-black/55 text-2xl font-semibold text-white backdrop-blur-[2px]",
                    more.className,
                  )}
                >
                  +{more.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <GalleryLightbox
          items={items}
          initialIndex={lightboxIndex}
          enableCollections
          detailAssignContext={{ defaultPerson: person }}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {slideshow && (
        <ShowcaseSlideshow
          items={items}
          startIndex={0}
          title={personName}
          onClose={() => {
            setSlideshow(false);
            playRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}
