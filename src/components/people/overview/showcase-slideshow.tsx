"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShowcaseItem } from "@/lib/services/person-showcase-service";
import { ShowcaseSourceChip } from "./showcase-source-chip";

// Full-screen slideshow over a person's showcase (2026-10-16): each photo whole,
// cross-faded, with a slow zoom; Space pauses, ←/→ step, Esc closes. Motion is
// off under prefers-reduced-motion.

const INTERVAL_MS = 5000;

const bestUrl = (item: ShowcaseItem) => item.urls.full_2400 ?? item.urls.view_1200 ?? item.urls.original;

export type ShowcaseSlideshowProps = {
  items: ShowcaseItem[];
  startIndex: number;
  title: string;
  onClose: () => void;
};

export function ShowcaseSlideshow({ items, startIndex, title, onClose }: ShowcaseSlideshowProps) {
  const [view, setView] = useState<{ index: number; prev: number | null }>({ index: startIndex, prev: null });
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = items.length;

  const go = useCallback(
    (delta: number) => setView((v) => ({ index: (v.index + delta + count) % count, prev: v.index })),
    [count],
  );

  // Auto-advance
  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setTimeout(() => go(1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [playing, view.index, count, go]);

  // Keys, focus, no page scroll behind
  useEffect(() => {
    rootRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else return;
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  // The next photo loads while this one shows
  useEffect(() => {
    const next = items[(view.index + 1) % count];
    if (next) new Image().src = bestUrl(next);
  }, [items, view.index, count]);

  const current = items[view.index];
  const previous = view.prev !== null ? items[view.prev] : null;
  if (!current) return null;

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Slideshow: ${title}`}
      className="fixed inset-0 z-[100] bg-black outline-none"
    >
      {/* The previous photo stays underneath while the new one fades in */}
      {previous && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`p${view.prev}`} src={bestUrl(previous)} alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}
      <div key={view.index} className="absolute inset-0 overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bestUrl(current)}
          alt={`${title} — photo ${view.index + 1} of ${count}`}
          className="h-full w-full object-contain motion-safe:animate-[showcase-kenburns_6s_linear_forwards]"
        />
      </div>

      {/* Progress of the current photo */}
      {playing && count > 1 && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10">
          <div key={view.index} className="h-full origin-left bg-white/70 animate-[showcase-progress_5s_linear_forwards]" />
        </div>
      )}

      {/* Controls — quiet until the pointer moves over them */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-4 text-white opacity-70 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100">
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate text-sm font-medium">{title}</p>
          <span className="shrink-0 text-xs tabular-nums text-white/70">
            {view.index + 1} / {count}
          </span>
          <ShowcaseSourceChip source={current.source} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SlideshowButton label="Previous photo (←)" onClick={() => go(-1)}>
            <ChevronLeft size={20} />
          </SlideshowButton>
          <SlideshowButton label={playing ? "Pause (Space)" : "Play (Space)"} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </SlideshowButton>
          <SlideshowButton label="Next photo (→)" onClick={() => go(1)}>
            <ChevronRight size={20} />
          </SlideshowButton>
          <SlideshowButton label="Close slideshow (Esc)" onClick={onClose}>
            <X size={20} />
          </SlideshowButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SlideshowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded-full p-2 text-white transition-colors duration-150 hover:bg-white/15 active:bg-white/25",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
      )}
    >
      {children}
    </button>
  );
}
