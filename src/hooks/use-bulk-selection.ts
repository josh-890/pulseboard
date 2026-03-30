"use client";

import { useCallback, useState } from "react";

export function useBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isSelecting,
    toggle,
    selectAll,
    clear,
    setSelecting: setIsSelecting,
    exitSelection,
  };
}
