"use client";

import { useEffect, useRef } from "react";

export type TagHotkeyHandlers = {
  /** 1–9: the quick-tag slot */
  onSlot?: (position: number) => void;
  /** T: the tag palette */
  onPalette?: () => void;
  /** Shift+T: choose a tag to arm */
  onArm?: () => void;
  /** P: paint the armed tag on; Shift+P: take it off */
  onPaint?: (remove: boolean) => void;
};

/**
 * Tagging keys for a selection in a grid (ADR-0033, S3). Ignored while typing
 * and while any dialog — the lightbox, a palette — owns the keyboard, the same
 * guard as the gallery selection keys. The lightbox wires the same keys into
 * its own handler for the current image.
 */
export function useTagHotkeys(enabled: boolean, handlers: TagHotkeyHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"], [data-lightbox-open]')) return;
      const h = ref.current;
      const key = e.key.toLowerCase();
      if (/^[1-9]$/.test(e.key) && h.onSlot) {
        e.preventDefault();
        h.onSlot(Number(e.key));
      } else if (key === "t" && e.shiftKey && h.onArm) {
        e.preventDefault();
        h.onArm();
      } else if (key === "t" && !e.shiftKey && h.onPalette) {
        e.preventDefault();
        h.onPalette();
      } else if (key === "p" && h.onPaint) {
        e.preventDefault();
        h.onPaint(e.shiftKey);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
