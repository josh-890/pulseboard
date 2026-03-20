"use client";

import { useCallback, useState } from "react";

export type BodySide = "front" | "back";

type UseBodyRegionStateOptions = {
  value: string[];
  onChange: (regions: string[]) => void;
  mode?: "single" | "multi";
};

export function useBodyRegionState({
  value,
  onChange,
  mode = "multi",
}: UseBodyRegionStateOptions) {
  const [side, setSide] = useState<BodySide>("front");
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Not memoized — must always read the latest `value` to avoid stale closure bugs
  // when multiple regions are clicked in quick succession.
  const toggleRegion = (id: string) => {
    if (mode === "single") {
      onChange(value.includes(id) ? [] : [id]);
      return;
    }
    if (value.includes(id)) {
      onChange(value.filter((r) => r !== id && !r.startsWith(id + ".")));
    } else {
      onChange([...value.filter((r) => !r.startsWith(id + ".")), id]);
    }
  };

  const toggleSubRegion = (subId: string) => {
    if (mode === "single") {
      onChange(value.includes(subId) ? [] : [subId]);
      return;
    }

    const parentId = subId.includes(".")
      ? subId.split(".")[0]
      : null;

    if (value.includes(subId)) {
      onChange(value.filter((r) => r !== subId));
    } else {
      let newValue = [...value, subId];
      if (parentId && newValue.includes(parentId)) {
        newValue = newValue.filter((r) => r !== parentId);
      }
      onChange(newValue);
    }
  };

  const removeRegion = (id: string) => {
    onChange(value.filter((r) => r !== id));
  };

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  return {
    selected: value,
    toggleRegion,
    toggleSubRegion,
    removeRegion,
    clearAll,
    isSelected: (id: string) => value.includes(id),
    side,
    setSide,
    hoveredRegion,
    setHoveredRegion,
  };
}
