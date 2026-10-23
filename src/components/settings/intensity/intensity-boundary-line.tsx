"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { BOUNDARY_TOOLTIP } from "@/components/intensity/intensity-hover-text";

export type IntensityBoundaryLineProps = {
  title: string;
  description: string | null;
};

// A boundary's dashed line across the board (2026-10-23). The whole line is a
// hover zone — a thin band along it, too thin to catch a card or "+ Act" — and
// its title and description follow the pointer, wherever on the line it is.
export function IntensityBoundaryLine({ title, description }: IntensityBoundaryLineProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="relative min-w-0 flex-1">
      <div className="border-foreground/30 pointer-events-none absolute inset-x-0 -top-px border-t-2 border-dashed" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-help"
        onMouseMove={(e) => setAt({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setAt(null)}
      />
      {at &&
        createPortal(
          <div
            role="tooltip"
            // Placed at the pointer — a style, it moves with it
            style={{ left: at.x + 12, top: at.y - 12 }}
            className={`${BOUNDARY_TOOLTIP} text-background pointer-events-none fixed z-[120] max-w-xs -translate-y-full rounded-md px-3 py-1.5 text-xs whitespace-pre-line shadow-md`}
          >
            <span className="font-semibold">◆ {title}</span>
            {description && <span className="mt-0.5 block">{description}</span>}
          </div>,
          document.body,
        )}
    </div>
  );
}
