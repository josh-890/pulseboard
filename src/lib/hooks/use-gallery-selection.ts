"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyRange,
  groupSelectionState,
  invertWithin,
  pruneTo,
} from "@/lib/gallery-selection";
import type { SelectionAnchor } from "@/lib/gallery-selection";

type Modifiers = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

type UseGallerySelectionArgs = {
  /** Image ids in the order the grid draws them — what ranges and Select all run over. */
  visibleOrder: string[];
  /** Open an image (lightbox) — a plain click does this when nothing is selected. */
  onOpen: (id: string) => void;
  /** False while a lightbox or dialog owns the keyboard. */
  keyboardEnabled: boolean;
};

/**
 * Multi-select for an image grid (set + session galleries), Google Photos style:
 * checkbox or Space toggles and sets the anchor; Shift extends from the anchor
 * with the anchor's state (see `applyRange`); once something is selected a click
 * on the image selects instead of opening; Ctrl/Cmd+A selects every visible
 * image; Esc clears.
 */
export function useGallerySelection({ visibleOrder, onOpen, keyboardEnabled }: UseGallerySelectionArgs) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const anchorRef = useRef<SelectionAnchor | null>(null);

  const toggle = useCallback(
    (id: string, mods: Modifiers) => {
      const anchor = anchorRef.current;
      if (mods.shiftKey && anchor) {
        setSelectedIds((prev) => applyRange(prev, visibleOrder, anchor, id));
        return;
      }
      const select = !selectedIds.has(id);
      anchorRef.current = { id, selected: select };
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (select) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [visibleOrder, selectedIds],
  );

  const tileClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (selectedIds.size > 0 || e.shiftKey || e.metaKey || e.ctrlKey) toggle(id, e);
      else onOpen(id);
    },
    [selectedIds.size, toggle, onOpen],
  );

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    anchorRef.current = null;
    setSelectedIds(new Set(visibleOrder));
  }, [visibleOrder]);

  const invert = useCallback(() => {
    anchorRef.current = null;
    setSelectedIds((prev) => invertWithin(prev, visibleOrder));
  }, [visibleOrder]);

  const toggleGroup = useCallback((ids: string[]) => {
    anchorRef.current = null;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (groupSelectionState(prev, ids) === "all") for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  /** Drop everything not in `order` — after a filter change or a bulk edit hid images. */
  const pruneToVisible = useCallback((order: string[]) => {
    setSelectedIds((prev) => pruneTo(prev, order));
  }, []);

  const groupState = useCallback(
    (ids: string[]) => groupSelectionState(selectedIds, ids),
    [selectedIds],
  );

  useEffect(() => {
    if (!keyboardEnabled) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"], [data-lightbox-open]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && visibleOrder.length > 0) {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape" && selectedIds.size > 0) {
        // The browse nav bar listens on window and takes Esc as "back to the
        // list" — clearing a selection must not also leave the page.
        e.preventDefault();
        e.stopPropagation();
        clear();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboardEnabled, visibleOrder.length, selectedIds.size, selectAll, clear]);

  return {
    selectedIds,
    setSelectedIds,
    toggle,
    tileClick,
    clear,
    selectAll,
    invert,
    toggleGroup,
    groupState,
    pruneToVisible,
  };
}
