"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";

type Focal = { x: number; y: number } | null;

type ImageCompareSliderProps = {
  beforeUrl: string;
  afterUrl: string;
  aspectW: number;
  aspectH: number;
  beforeLabel?: string;
  afterLabel?: string;
  /** "cover" crops each image to the frame (using its focal); "contain" letterboxes. */
  fit?: "cover" | "contain";
  beforeFocal?: Focal;
  afterFocal?: Focal;
};

function focalPos(focal: Focal): string | undefined {
  if (!focal) return undefined;
  return `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%`;
}

/**
 * Draggable before/after reveal slider (juxtapose-style, no dependency). Both
 * images are letterboxed (object-contain) into a shared frame so differing aspect
 * ratios still overlay; a clip-path divides them at the handle. Aligned images
 * (shared framing) wipe pixel-for-pixel.
 */
export function ImageCompareSlider({
  beforeUrl,
  afterUrl,
  aspectW,
  aspectH,
  beforeLabel = "Before",
  afterLabel = "After",
  fit = "contain",
  beforeFocal = null,
  afterFocal = null,
}: ImageCompareSliderProps) {
  const fitClass = fit === "cover" ? "object-cover" : "object-contain";
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(50);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div
      ref={ref}
      className="relative w-full touch-none select-none overflow-hidden rounded-lg border border-white/10 bg-black/50"
      style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => { if (dragging.current) updateFromClientX(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerLeave={() => { dragging.current = false; }}
    >
      {/* After (bottom layer, full) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterUrl}
        alt={afterLabel}
        draggable={false}
        className={`pointer-events-none absolute inset-0 h-full w-full ${fitClass}`}
        style={{ objectPosition: fit === "cover" ? focalPos(afterFocal) : undefined }}
      />
      {/* Before (top layer, clipped to the left of the handle) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt={beforeLabel}
        draggable={false}
        className={`pointer-events-none absolute inset-0 h-full w-full ${fitClass}`}
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)`, objectPosition: fit === "cover" ? focalPos(beforeFocal) : undefined }}
      />

      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">{beforeLabel}</span>
      <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">{afterLabel}</span>

      {/* Divider + handle */}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow" style={{ left: `${pos}%` }}>
        <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-md">
          <ChevronsLeftRight size={15} />
        </div>
      </div>
    </div>
  );
}
