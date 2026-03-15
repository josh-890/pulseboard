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

  const toggleRegion = useCallback(
    (id: string) => {
      if (mode === "single") {
        onChange(value.includes(id) ? [] : [id]);
        return;
      }
      if (value.includes(id)) {
        // Deselect parent and any of its sub-regions
        onChange(value.filter((r) => r !== id && !r.startsWith(id + ".")));
      } else {
        // Select parent, remove any sub-regions (parent supersedes them)
        onChange([...value.filter((r) => !r.startsWith(id + ".")), id]);
      }
    },
    [value, onChange, mode],
  );

  /** Toggle a sub-region: if parent was selected, replace it with the sub-region */
  const toggleSubRegion = useCallback(
    (subId: string) => {
      if (mode === "single") {
        onChange(value.includes(subId) ? [] : [subId]);
        return;
      }

      // Find the parent ID (everything before the last dot, or for "spine" it's special)
      const parentId = subId.includes(".")
        ? subId.split(".")[0]
        : null;

      if (value.includes(subId)) {
        // Deselect sub-region
        onChange(value.filter((r) => r !== subId));
      } else {
        // Select sub-region, remove parent if it was selected
        let newValue = [...value, subId];
        if (parentId && newValue.includes(parentId)) {
          newValue = newValue.filter((r) => r !== parentId);
        }
        onChange(newValue);
      }
    },
    [value, onChange, mode],
  );

  const removeRegion = useCallback(
    (id: string) => {
      onChange(value.filter((r) => r !== id));
    },
    [value, onChange],
  );

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
