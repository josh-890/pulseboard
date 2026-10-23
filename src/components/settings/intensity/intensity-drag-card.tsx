"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type IntensityDragCardProps = {
  name: string;
  /** Where the pointer was when the card was picked up */
  start: { x: number; y: number };
  /** Where the card was gripped, from its top left */
  grip: { x: number; y: number };
  width: number;
};

// The card in hand while dragging with a mouse or a finger. It follows the
// pointer itself, so it stays where it was gripped whatever moves beneath it —
// lanes opening, cells growing, the page scrolled (2026-10-23).
export function IntensityDragCard({ name, start, grip, width }: IntensityDragCardProps) {
  const [at, setAt] = useState(start);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => setAt({ x: e.clientX, y: e.clientY });
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) setAt({ x: t.clientX, y: t.clientY });
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("touchmove", onTouch, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
    };
  }, []);

  return createPortal(
    <div
      aria-hidden="true"
      // Position follows the pointer every frame — a style, not a class
      style={{ left: at.x - grip.x, top: at.y - grip.y, width }}
      className="bg-popover border-primary/40 pointer-events-none fixed z-[999] cursor-grabbing rounded-lg border px-2.5 py-1 text-sm font-medium shadow-lg"
    >
      {name}
    </div>,
    document.body,
  );
}
