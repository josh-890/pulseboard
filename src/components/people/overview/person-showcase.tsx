"use client";

import { useRef, useState, useTransition } from "react";
import NextImage from "next/image";
import { toast } from "sonner";
import { Dices, Images, Loader2, Play, Shuffle, Sparkles } from "lucide-react";
import { cn, focalStyle } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GalleryLightbox } from "@/components/gallery/gallery-lightbox";
import { getPersonShowcaseAction } from "@/lib/actions/person-actions";
import type {
  PersonShowcase as PersonShowcaseData,
  ShowcaseItem,
  ShowcaseMode,
} from "@/lib/services/person-showcase-service";
import { ShowcaseSourceChip } from "./showcase-source-chip";
import { ShowcaseSlideshow } from "./showcase-slideshow";

// The top of a person's Overview (2026-10-16): their best photos as a mosaic — one
// large tile and the next ones beside it — the way you marked them (iconic, ★,
// outtake), filled with their production photos at random. Iconic stays in front;
// the rest rotates daily. A tile opens the lightbox over the whole pool, ▶ a
// full-screen slideshow.
//
// "Random" (2026-10-16) deals the person's production photos instead — two per
// set in turn, marks ignored for the choice — and Shuffle deals again. Since
// 2026-10-17 the page opens in Random (a new deal per visit; Best for a person with
// reference photos only) and loads the other selection when you switch to it.
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

const MODES: { value: ShowcaseMode; label: string; icon: typeof Shuffle }[] = [
  { value: "random", label: "Random", icon: Dices },
  { value: "best", label: "Best", icon: Sparkles },
];

// Not crypto.randomUUID(): browsers offer it only on https or localhost, and the
// app runs on plain http in the LAN
const newSeed = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export function PersonShowcase({ showcase, personName, person }: PersonShowcaseProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const [mode, setMode] = useState<ShowcaseMode>(showcase.mode);
  // Each selection once loaded; switching back shows it as you left it
  const [pools, setPools] = useState<Partial<Record<ShowcaseMode, PersonShowcaseData>>>({ [showcase.mode]: showcase });
  const [isLoading, startLoad] = useTransition();
  const playRef = useRef<HTMLButtonElement>(null);
  const modeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // While the other selection loads, the current one stays (dimmed)
  const pool = pools[mode] ?? showcase;
  const { items, curatedCount, setCount } = pool;
  if (showcase.items.length === 0) return null;

  function load(next: ShowcaseMode, seed?: string) {
    startLoad(async () => {
      try {
        const loaded = await getPersonShowcaseAction(person.id, next, seed);
        setPools((prev) => ({ ...prev, [next]: loaded }));
        setLightboxIndex(null);
      } catch (err) {
        console.error("Showcase load failed", { mode: next }, err);
        toast.error(seed ? "Could not shuffle — try again" : "Could not load the selection — try again");
      }
    });
  }

  // From Best too: switches to Random with a fresh deal
  function shuffle() {
    setMode("random");
    load("random", newSeed());
  }

  function chooseMode(next: ShowcaseMode) {
    if (next === mode) return;
    setMode(next);
    setLightboxIndex(null);
    if (pools[next]) return;
    if (next === "random") shuffle();
    else load("best");
  }

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
            {pool.mode === "random"
              ? `Random from ${setCount} set${setCount === 1 ? "" : "s"} — shuffle for more`
              : curatedCount > 0
                ? `${curatedCount} you marked${curatedCount < items.length ? ", the rest picked at random" : ""} · changes daily`
                : "Picked at random from their sets — mark photos iconic, ★ or outtake to lead here · changes daily"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Random · Best as one pill group; Shuffle is a segment of the Random pill
              (like "only" on a person pill), always there so nothing shifts — in
              Best it switches to Random with a fresh deal */}
          <div
            role="radiogroup"
            aria-label="Showcase selection"
            className="inline-flex gap-0.5 rounded-md border border-border bg-background p-0.5"
          >
            {MODES.map((m, i) => {
              const on = mode === m.value;
              const radio = (
                <button
                  ref={(el) => {
                    modeRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => chooseMode(m.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + MODES.length) % MODES.length;
                    chooseMode(MODES[next].value);
                    modeRefs.current[next]?.focus();
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    !on && "hover:bg-muted active:bg-muted/80",
                  )}
                >
                  <m.icon size={12} aria-hidden="true" />
                  {m.label}
                </button>
              );
              return (
                <span
                  key={m.value}
                  className={cn(
                    // The chosen pill filled, the other plain text that reacts to
                    // the pointer — a choice, not a disabled button
                    "inline-flex items-stretch overflow-hidden rounded transition-colors duration-150",
                    on ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground",
                  )}
                >
                  {radio}
                  {m.value === "random" && (
                    <button
                      type="button"
                      onClick={shuffle}
                      disabled={isLoading}
                      aria-label="Shuffle"
                      title={on ? "Shuffle — deal new photos" : "Shuffle — random photos"}
                      className={cn(
                        "inline-flex items-center border-l px-1.5 transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        "disabled:cursor-wait",
                        on
                          ? "border-primary-foreground/25 hover:bg-primary-foreground/15"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {isLoading && mode === "random" ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Shuffle size={12} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
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

      <div
        className={cn(
          "grid grid-cols-3 gap-2 transition-opacity duration-200 md:grid-cols-4 lg:grid-cols-5",
          isLoading && "opacity-60",
        )}
        aria-busy={isLoading}
      >
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
                "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
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
