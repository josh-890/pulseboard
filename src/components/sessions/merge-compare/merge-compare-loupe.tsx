"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Link2, Link2Off } from "lucide-react";
import { ZOOM_FIT, ZoomableImage, type ZoomView } from "@/components/media/zoomable-image";
import type { GalleryItem } from "@/lib/types";
import { cn } from "@/lib/utils";

// The 2-up loupe of the compare page (2026-10-20), after Lightroom's Compare:
// one photo of each session side by side, zoom and pan coupled so the same spot
// of outfit or background is seen on both. ←/→ step through the side last
// clicked; Esc closes.

type Side = "stays" | "goes";

export type MergeCompareLoupeProps = {
  left: { photos: GalleryItem[]; id: string; name: string };
  right: { photos: GalleryItem[]; id: string; name: string };
  onChange: (side: Side, photoId: string) => void;
  onClose: () => void;
};

export function MergeCompareLoupe({ left, right, onChange, onClose }: MergeCompareLoupeProps) {
  const [synced, setSynced] = useState(true);
  const [shared, setShared] = useState<ZoomView>(ZOOM_FIT);
  const [own, setOwn] = useState<Record<Side, ZoomView>>({ stays: ZOOM_FIT, goes: ZOOM_FIT });
  const [activeSide, setActiveSide] = useState<Side>("goes");

  const sides = { stays: left, goes: right };

  function step(side: Side, delta: number) {
    const { photos, id } = sides[side];
    const i = photos.findIndex((p) => p.id === id);
    const next = photos[(i + delta + photos.length) % photos.length];
    if (!next || next.id === id) return;
    setShared(ZOOM_FIT);
    setOwn((o) => ({ ...o, [side]: ZOOM_FIT }));
    onChange(side, next.id);
  }

  // Keys for the loupe only — capture phase, so the page's own keys stay quiet
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(activeSide, 1);
      else if (e.key === "ArrowLeft") step(activeSide, -1);
      else if (e.key === "s" || e.key === "S") setSynced((v) => !v);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Compare two photos" className="fixed inset-0 z-[120] flex flex-col bg-black">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close compare"
          className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <span className="text-sm font-semibold text-white">Compare</span>
        <button
          type="button"
          onClick={() => setSynced((v) => !v)}
          aria-pressed={synced}
          title="Zoom both together (S)"
          className={cn(
            "ml-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
            synced ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-200" : "border-white/15 text-zinc-300 hover:bg-white/5",
          )}
        >
          {synced ? <Link2 size={13} aria-hidden="true" /> : <Link2Off size={13} aria-hidden="true" />}
          Sync zoom
        </button>
        <span className="ml-auto hidden text-[11px] text-zinc-500 sm:inline">
          Double-click to zoom · ←/→ next photo on the side last clicked · Esc closes
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {(["stays", "goes"] as const).map((side) => {
          const { photos, id, name } = sides[side];
          const photo = photos.find((p) => p.id === id);
          const index = photos.findIndex((p) => p.id === id);
          return (
            <div
              key={side}
              data-loupe-side={side}
              onPointerDown={() => setActiveSide(side)}
              className={cn(
                "relative flex min-h-0 flex-1 flex-col",
                side === "stays" && "border-b border-white/10 sm:border-b-0 sm:border-r",
                activeSide === side && "bg-white/[0.03]",
              )}
            >
              <div className="relative min-h-0 flex-1">
                {photo ? (
                  <ZoomableImage
                    fitUrl={photo.urls.full_2400 ?? photo.urls.view_1200 ?? photo.urls.original}
                    zoomUrl={photo.urls.master_4000}
                    width={photo.originalWidth}
                    height={photo.originalHeight}
                    alt={photo.caption ?? photo.filename}
                    view={synced ? shared : own[side]}
                    onViewChange={(v) => (synced ? setShared(v) : setOwn((o) => ({ ...o, [side]: v })))}
                  />
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-zinc-500">No photo pinned</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-zinc-300">
                <button
                  type="button"
                  onClick={() => step(side, -1)}
                  aria-label="Previous photo"
                  className="rounded p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    side === "stays" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300",
                  )}
                >
                  {side === "stays" ? "Stays" : "Merged in"}
                </span>
                <span className="min-w-0 truncate" title={name}>
                  {name}
                </span>
                <span className="min-w-0 truncate text-zinc-500" title={photo?.setLinks?.map((l) => l.setTitle).join(", ")}>
                  {photo?.setLinks?.map((l) => l.setTitle).join(", ")}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-zinc-500">
                  {index + 1} / {photos.length}
                </span>
                <button
                  type="button"
                  onClick={() => step(side, 1)}
                  aria-label="Next photo"
                  className="rounded p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
